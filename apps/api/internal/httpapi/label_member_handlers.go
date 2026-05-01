package httpapi

import (
	"net/http"
	"strings"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

func (s *Server) createLabel(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.Color == "" {
		errorJSON(w, http.StatusBadRequest, "label name and color are required")
		return
	}

	label := models.Label{
		BoardID:  boardID,
		Name:     req.Name,
		Color:    req.Color,
		Position: nextLabelPosition(s.db, boardID),
	}
	if err := s.db.Create(&label).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create label")
		return
	}

	s.publishBoardUpdated(boardID)
	s.respondBoard(w, http.StatusCreated, boardID)
}

func (s *Server) attachLabel(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	labelID, err := paramUint(r, "labelID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid label id")
		return
	}

	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	var label models.Label
	if err := s.db.First(&label, "id = ? AND board_id = ?", labelID, board.ID).Error; err != nil {
		errorJSON(w, http.StatusBadRequest, "label does not belong to board")
		return
	}

	var count int64
	_ = s.db.Table("card_labels").Where("card_id = ? AND label_id = ?", card.ID, label.ID).Count(&count).Error
	if count == 0 {
		if err := s.db.Model(&card).Association("Labels").Append(&label); err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not attach label")
			return
		}
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) detachLabel(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	labelID, err := paramUint(r, "labelID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid label id")
		return
	}

	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	label := models.Label{ID: labelID}
	if err := s.db.Model(&card).Association("Labels").Delete(&label); err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not detach label")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) deleteLabel(w http.ResponseWriter, r *http.Request) {
	labelID, err := paramUint(r, "labelID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid label id")
		return
	}

	var label models.Label
	if err := s.db.First(&label, labelID).Error; err != nil {
		errorJSON(w, http.StatusNotFound, "label not found")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, label.BoardID); !ok {
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM card_labels WHERE label_id = ?", label.ID).Error; err != nil {
			return err
		}
		return tx.Delete(&label).Error
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not delete label")
		return
	}

	s.publishBoardUpdated(label.BoardID)
	s.respondBoard(w, http.StatusOK, label.BoardID)
}

func (s *Server) attachMember(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	memberID, err := paramUint(r, "memberID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid member id")
		return
	}

	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	var membership models.WorkspaceMember
	if err := s.db.First(&membership, "workspace_id = ? AND user_id = ?", board.WorkspaceID, memberID).Error; err != nil {
		errorJSON(w, http.StatusBadRequest, "member does not belong to workspace")
		return
	}

	user := models.User{ID: memberID}
	var count int64
	_ = s.db.Table("card_members").Where("card_id = ? AND user_id = ?", card.ID, memberID).Count(&count).Error
	if count == 0 {
		if err := s.db.Model(&card).Association("Members").Append(&user); err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not attach member")
			return
		}
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) detachMember(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	memberID, err := paramUint(r, "memberID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid member id")
		return
	}

	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	user := models.User{ID: memberID}
	if err := s.db.Model(&card).Association("Members").Delete(&user); err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not detach member")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}
