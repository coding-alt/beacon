package httpapi

import (
	"errors"
	"net/http"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

func (s *Server) requireWorkspaceMember(w http.ResponseWriter, r *http.Request, workspaceID uint) (models.WorkspaceMember, bool) {
	var member models.WorkspaceMember
	err := s.db.Where("workspace_id = ? AND user_id = ?", workspaceID, currentUserID(r)).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		errorJSON(w, http.StatusForbidden, "workspace access denied")
		return member, false
	}
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not verify workspace access")
		return member, false
	}

	return member, true
}

func (s *Server) requireWorkspaceAdmin(w http.ResponseWriter, r *http.Request, workspaceID uint) (models.WorkspaceMember, bool) {
	member, ok := s.requireWorkspaceMember(w, r, workspaceID)
	if !ok {
		return member, false
	}
	if member.Role != "owner" && member.Role != "admin" {
		errorJSON(w, http.StatusForbidden, "admin access required")
		return member, false
	}

	return member, true
}

func (s *Server) requireBoardAccess(w http.ResponseWriter, r *http.Request, boardID uint) (models.Board, bool) {
	var board models.Board
	if err := s.db.First(&board, boardID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			errorJSON(w, http.StatusNotFound, "board not found")
			return board, false
		}
		errorJSON(w, http.StatusInternalServerError, "could not load board")
		return board, false
	}

	if _, ok := s.requireWorkspaceMember(w, r, board.WorkspaceID); !ok {
		return board, false
	}

	return board, true
}

func (s *Server) requireListAccess(w http.ResponseWriter, r *http.Request, listID uint) (models.List, models.Board, bool) {
	var list models.List
	if err := s.db.First(&list, listID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			errorJSON(w, http.StatusNotFound, "list not found")
			return list, models.Board{}, false
		}
		errorJSON(w, http.StatusInternalServerError, "could not load list")
		return list, models.Board{}, false
	}

	board, ok := s.requireBoardAccess(w, r, list.BoardID)
	return list, board, ok
}

func (s *Server) requireCardAccess(w http.ResponseWriter, r *http.Request, cardID uint) (models.Card, models.Board, bool) {
	var card models.Card
	if err := s.db.First(&card, cardID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			errorJSON(w, http.StatusNotFound, "card not found")
			return card, models.Board{}, false
		}
		errorJSON(w, http.StatusInternalServerError, "could not load card")
		return card, models.Board{}, false
	}

	board, ok := s.requireBoardAccess(w, r, card.BoardID)
	return card, board, ok
}

func (s *Server) requireChecklistAccess(w http.ResponseWriter, r *http.Request, checklistID uint) (models.Checklist, models.Card, models.Board, bool) {
	var checklist models.Checklist
	if err := s.db.First(&checklist, checklistID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			errorJSON(w, http.StatusNotFound, "checklist not found")
			return checklist, models.Card{}, models.Board{}, false
		}
		errorJSON(w, http.StatusInternalServerError, "could not load checklist")
		return checklist, models.Card{}, models.Board{}, false
	}

	card, board, ok := s.requireCardAccess(w, r, checklist.CardID)
	return checklist, card, board, ok
}

func (s *Server) requireChecklistItemAccess(w http.ResponseWriter, r *http.Request, itemID uint) (models.ChecklistItem, models.Checklist, models.Card, models.Board, bool) {
	var item models.ChecklistItem
	if err := s.db.First(&item, itemID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			errorJSON(w, http.StatusNotFound, "checklist item not found")
			return item, models.Checklist{}, models.Card{}, models.Board{}, false
		}
		errorJSON(w, http.StatusInternalServerError, "could not load checklist item")
		return item, models.Checklist{}, models.Card{}, models.Board{}, false
	}

	checklist, card, board, ok := s.requireChecklistAccess(w, r, item.ChecklistID)
	return item, checklist, card, board, ok
}
