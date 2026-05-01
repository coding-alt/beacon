package httpapi

import (
	"net/http"
	"strings"

	"github.com/beacon-team/beacon/apps/api/internal/models"
)

func (s *Server) createComment(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	var req struct {
		Body string `json:"body"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		errorJSON(w, http.StatusBadRequest, "comment body is required")
		return
	}

	comment := models.Comment{CardID: card.ID, UserID: currentUserID(r), Body: req.Body}
	if err := s.db.Create(&comment).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create comment")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusCreated, board.ID)
}

func (s *Server) createChecklist(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = "清单"
	}

	checklist := models.Checklist{CardID: card.ID, Title: req.Title, Position: nextChecklistPosition(s.db, card.ID)}
	if err := s.db.Create(&checklist).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create checklist")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusCreated, board.ID)
}

func (s *Server) createChecklistItem(w http.ResponseWriter, r *http.Request) {
	checklistID, err := paramUint(r, "checklistID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid checklist id")
		return
	}
	checklist, _, board, ok := s.requireChecklistAccess(w, r, checklistID)
	if !ok {
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		errorJSON(w, http.StatusBadRequest, "checklist item title is required")
		return
	}

	item := models.ChecklistItem{ChecklistID: checklist.ID, Title: req.Title, Position: nextChecklistItemPosition(s.db, checklist.ID)}
	if err := s.db.Create(&item).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create checklist item")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusCreated, board.ID)
}

func (s *Server) updateChecklistItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := paramUint(r, "itemID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid checklist item id")
		return
	}
	item, _, _, board, ok := s.requireChecklistItemAccess(w, r, itemID)
	if !ok {
		return
	}

	var req struct {
		Title    *string `json:"title"`
		Checked  *bool   `json:"checked"`
		Position *int    `json:"position"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	updates := map[string]any{}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			errorJSON(w, http.StatusBadRequest, "checklist item title is required")
			return
		}
		updates["title"] = title
	}
	if req.Checked != nil {
		updates["checked"] = *req.Checked
	}
	if req.Position != nil {
		updates["position"] = *req.Position
	}

	if len(updates) > 0 {
		if err := s.db.Model(&item).Updates(updates).Error; err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not update checklist item")
			return
		}
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) deleteChecklistItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := paramUint(r, "itemID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid checklist item id")
		return
	}
	item, _, _, board, ok := s.requireChecklistItemAccess(w, r, itemID)
	if !ok {
		return
	}

	if err := s.db.Delete(&item).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not delete checklist item")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}
