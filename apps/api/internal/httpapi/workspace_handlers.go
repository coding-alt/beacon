package httpapi

import (
	"net/http"
	"strings"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	var workspaces []models.Workspace
	err := s.db.
		Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ?", currentUserID(r)).
		Order("workspaces.updated_at DESC").
		Find(&workspaces).Error
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not list workspaces")
		return
	}

	respondJSON(w, http.StatusOK, workspaces)
}

func (s *Server) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		errorJSON(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	workspace := models.Workspace{Name: req.Name, Slug: slugify(req.Name), OwnerID: currentUserID(r)}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}
		member := models.WorkspaceMember{WorkspaceID: workspace.ID, UserID: currentUserID(r), Role: "owner"}
		return tx.Create(&member).Error
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create workspace")
		return
	}

	respondJSON(w, http.StatusCreated, workspace)
}

func (s *Server) updateWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	member, ok := s.requireWorkspaceAdmin(w, r, workspaceID)
	if !ok {
		return
	}

	var req struct {
		Name *string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			errorJSON(w, http.StatusBadRequest, "workspace name is required")
			return
		}
		updates["name"] = name
		updates["slug"] = slugify(name)
	}

	if len(updates) > 0 {
		if err := s.db.Model(&models.Workspace{}).
			Where("id = ?", workspaceID).
			Updates(updates).Error; err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not update workspace")
			return
		}
	}

	var workspace models.Workspace
	if err := s.db.First(&workspace, member.WorkspaceID).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not load workspace")
		return
	}

	respondJSON(w, http.StatusOK, workspace)
}

func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}

	var workspace models.Workspace
	if err := s.db.First(&workspace, workspaceID).Error; err != nil {
		errorJSON(w, http.StatusNotFound, "workspace not found")
		return
	}
	if workspace.OwnerID != currentUserID(r) {
		errorJSON(w, http.StatusForbidden, "only the workspace owner can delete it")
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		var boardIDs []uint
		if err := tx.Model(&models.Board{}).Where("workspace_id = ?", workspaceID).Pluck("id", &boardIDs).Error; err != nil {
			return err
		}
		if err := deleteBoardsByIDs(tx, boardIDs); err != nil {
			return err
		}
		if err := tx.Where("workspace_id = ?", workspaceID).Delete(&models.WorkspaceMember{}).Error; err != nil {
			return err
		}

		return tx.Delete(&workspace).Error
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not delete workspace")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) listWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireWorkspaceMember(w, r, workspaceID); !ok {
		return
	}

	var members []models.WorkspaceMember
	err = s.db.
		Where("workspace_id = ?", workspaceID).
		Preload("User").
		Order("created_at ASC").
		Find(&members).Error
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not list workspace members")
		return
	}

	respondJSON(w, http.StatusOK, members)
}

func (s *Server) inviteWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireWorkspaceAdmin(w, r, workspaceID); !ok {
		return
	}

	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Role == "" {
		req.Role = "member"
	}
	if req.Role != "member" && req.Role != "admin" {
		errorJSON(w, http.StatusBadRequest, "role must be member or admin")
		return
	}

	var user models.User
	if err := s.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		errorJSON(w, http.StatusNotFound, "user must register before being added")
		return
	}

	member := models.WorkspaceMember{WorkspaceID: workspaceID, UserID: user.ID, Role: req.Role}
	err = s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "workspace_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"role", "updated_at"}),
	}).Create(&member).Error
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not add member")
		return
	}

	if err := s.db.Preload("User").First(&member, "workspace_id = ? AND user_id = ?", workspaceID, user.ID).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not load member")
		return
	}

	respondJSON(w, http.StatusCreated, member)
}
