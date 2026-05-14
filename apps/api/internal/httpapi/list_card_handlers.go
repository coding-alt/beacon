package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

func (s *Server) createList(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		errorJSON(w, http.StatusBadRequest, "list name is required")
		return
	}

	list := models.List{BoardID: boardID, Name: req.Name, Position: nextListPosition(s.db, boardID)}
	if err := s.db.Create(&list).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create list")
		return
	}

	s.publishBoardUpdated(boardID)
	s.respondBoard(w, http.StatusCreated, boardID)
}

func (s *Server) updateList(w http.ResponseWriter, r *http.Request) {
	listID, err := paramUint(r, "listID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid list id")
		return
	}
	list, board, ok := s.requireListAccess(w, r, listID)
	if !ok {
		return
	}

	var req struct {
		Name     *string `json:"name"`
		Position *int    `json:"position"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			errorJSON(w, http.StatusBadRequest, "list name is required")
			return
		}
		updates["name"] = name
	}
	if req.Position != nil {
		updates["position"] = *req.Position
	}

	if len(updates) > 0 {
		if err := s.db.Model(&list).Updates(updates).Error; err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not update list")
			return
		}
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) deleteList(w http.ResponseWriter, r *http.Request) {
	listID, err := paramUint(r, "listID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid list id")
		return
	}
	list, board, ok := s.requireListAccess(w, r, listID)
	if !ok {
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		return deleteListsByIDs(tx, []uint{list.ID})
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not delete list")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) reorderLists(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	var req struct {
		Lists []struct {
			ID       uint `json:"id"`
			Position int  `json:"position"`
		} `json:"lists"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range req.Lists {
			result := tx.Model(&models.List{}).
				Where("id = ? AND board_id = ?", item.ID, boardID).
				Update("position", item.Position)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return fmt.Errorf("list %d does not belong to board", item.ID)
			}
		}
		return nil
	})
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "could not reorder lists")
		return
	}

	s.publishBoardUpdated(boardID)
	s.respondBoard(w, http.StatusOK, boardID)
}

func (s *Server) createCard(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	board, ok := s.requireBoardAccess(w, r, boardID)
	if !ok {
		return
	}

	var req struct {
		ListID      uint   `json:"listId"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
		Summary     string `json:"summary"`
		StartDate   string `json:"startDate"`
		DueDate     string `json:"dueDate"`
		CompletedAt string `json:"completedAt"`
		CoverColor  string `json:"coverColor"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || req.ListID == 0 {
		errorJSON(w, http.StatusBadRequest, "card title and listId are required")
		return
	}

	var list models.List
	if err := s.db.First(&list, "id = ? AND board_id = ?", req.ListID, board.ID).Error; err != nil {
		errorJSON(w, http.StatusBadRequest, "list does not belong to board")
		return
	}

	dueDate, err := parseOptionalDate(req.DueDate)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid due date")
		return
	}
	startDate, err := parseOptionalDate(req.StartDate)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid start date")
		return
	}
	completedAt, err := parseOptionalDate(req.CompletedAt)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid completed date")
		return
	}
	progress := list.Name
	now := time.Now()
	if startDate == nil && progress != "未开始" {
		startDate = &now
	}
	if completedAt == nil && progress == "已完成" {
		completedAt = &now
	}

	card := models.Card{
		BoardID:              board.ID,
		ListID:               req.ListID,
		Title:                req.Title,
		Description:          req.Description,
		Position:             nextCardPosition(s.db, req.ListID),
		CoverColor:           req.CoverColor,
		Priority:             strings.TrimSpace(req.Priority),
		Summary:              req.Summary,
		StartDate:            startDate,
		DueDate:              dueDate,
		CompletedAt:          completedAt,
		Progress:             progress,
		LatestProgressRecord: progressRecord("", progress),
		CreatedByID:          currentUserID(r),
	}
	if err := s.db.Create(&card).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create card")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusCreated, board.ID)
}

func (s *Server) updateCard(w http.ResponseWriter, r *http.Request) {
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
		Title                *string `json:"title"`
		Description          *string `json:"description"`
		ListID               *uint   `json:"listId"`
		Position             *int    `json:"position"`
		CoverColor           *string `json:"coverColor"`
		Priority             *string `json:"priority"`
		Summary              *string `json:"summary"`
		StartDate            *string `json:"startDate"`
		DueDate              *string `json:"dueDate"`
		CompletedAt          *string `json:"completedAt"`
		Progress             *string `json:"progress"`
		LatestProgressRecord *string `json:"latestProgressRecord"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	updates := map[string]any{}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			errorJSON(w, http.StatusBadRequest, "card title is required")
			return
		}
		updates["title"] = title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.ListID != nil {
		var list models.List
		if err := s.db.First(&list, "id = ? AND board_id = ?", *req.ListID, board.ID).Error; err != nil {
			errorJSON(w, http.StatusBadRequest, "list does not belong to board")
			return
		}
		updates["list_id"] = *req.ListID
		updates["progress"] = list.Name
		updates["latest_progress_record"] = progressRecord(card.Progress, list.Name)
		now := time.Now()
		if card.StartDate == nil && list.Name != "未开始" {
			updates["start_date"] = &now
		}
		if card.CompletedAt == nil && list.Name == "已完成" {
			updates["completed_at"] = &now
		}
	}
	if req.Position != nil {
		updates["position"] = *req.Position
	}
	if req.CoverColor != nil {
		updates["cover_color"] = *req.CoverColor
	}
	if req.Priority != nil {
		updates["priority"] = strings.TrimSpace(*req.Priority)
	}
	if req.Summary != nil {
		updates["summary"] = *req.Summary
	}
	if req.StartDate != nil {
		startDate, err := parseOptionalDate(*req.StartDate)
		if err != nil {
			errorJSON(w, http.StatusBadRequest, "invalid start date")
			return
		}
		updates["start_date"] = startDate
	}
	if req.DueDate != nil {
		dueDate, err := parseOptionalDate(*req.DueDate)
		if err != nil {
			errorJSON(w, http.StatusBadRequest, "invalid due date")
			return
		}
		updates["due_date"] = dueDate
	}
	if req.CompletedAt != nil {
		completedAt, err := parseOptionalDate(*req.CompletedAt)
		if err != nil {
			errorJSON(w, http.StatusBadRequest, "invalid completed date")
			return
		}
		updates["completed_at"] = completedAt
	}
	if req.Progress != nil {
		progress := strings.TrimSpace(*req.Progress)
		updates["progress"] = progress
		updates["latest_progress_record"] = progressRecord(card.Progress, progress)
		if progress != "" {
			var list models.List
			if err := s.db.First(&list, "board_id = ? AND name = ?", board.ID, progress).Error; err == nil {
				updates["list_id"] = list.ID
				now := time.Now()
				if card.StartDate == nil && progress != "未开始" {
					updates["start_date"] = &now
				}
				if card.CompletedAt == nil && progress == "已完成" {
					updates["completed_at"] = &now
				}
			}
		}
	}
	if req.LatestProgressRecord != nil {
		updates["latest_progress_record"] = *req.LatestProgressRecord
	}
	if len(updates) > 0 {
		if err := s.db.Model(&card).Updates(updates).Error; err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not update card")
			return
		}
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) deleteCard(w http.ResponseWriter, r *http.Request) {
	cardID, err := paramUint(r, "cardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid card id")
		return
	}
	card, board, ok := s.requireCardAccess(w, r, cardID)
	if !ok {
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		return deleteCardsByIDs(tx, []uint{card.ID})
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not delete card")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusOK, board.ID)
}

func (s *Server) reorderCards(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	var req struct {
		Cards []struct {
			ID       uint `json:"id"`
			ListID   uint `json:"listId"`
			Position int  `json:"position"`
		} `json:"cards"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		var listIDs []uint
		for _, item := range req.Cards {
			listIDs = append(listIDs, item.ListID)
		}
		var lists []models.List
		if err := tx.Where("id IN ? AND board_id = ?", listIDs, boardID).Find(&lists).Error; err != nil {
			return err
		}
		listNames := make(map[uint]string, len(lists))
		for _, list := range lists {
			listNames[list.ID] = list.Name
		}

		for _, item := range req.Cards {
			listName, ok := listNames[item.ListID]
			if !ok {
				return fmt.Errorf("list %d does not belong to board", item.ListID)
			}

			var card models.Card
			if err := tx.First(&card, "id = ? AND board_id = ?", item.ID, boardID).Error; err != nil {
				return fmt.Errorf("card %d does not belong to board", item.ID)
			}
			updates := map[string]any{"list_id": item.ListID, "position": item.Position}
			if card.ListID != item.ListID || card.Progress == "" || card.Progress != listName {
				updates["progress"] = listName
				updates["latest_progress_record"] = progressRecord(card.Progress, listName)
				now := time.Now()
				if card.StartDate == nil && listName != "未开始" {
					updates["start_date"] = &now
				}
				if card.CompletedAt == nil && listName == "已完成" {
					updates["completed_at"] = &now
				}
			}

			result := tx.Model(&card).Updates(updates)
			if result.Error != nil {
				return result.Error
			}
		}
		return nil
	})
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "could not reorder cards")
		return
	}

	s.publishBoardUpdated(boardID)
	s.respondBoard(w, http.StatusOK, boardID)
}

func parseOptionalDate(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed, nil
	}

	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

func progressRecord(from string, to string) string {
	now := time.Now().Format("2006-01-02 15:04")
	from = strings.TrimSpace(from)
	to = strings.TrimSpace(to)
	if to == "" {
		return now + " 更新进展"
	}
	if from == "" || from == to {
		return fmt.Sprintf("%s 当前进展：%s", now, to)
	}

	return fmt.Sprintf("%s 进展从「%s」更新为「%s」", now, from, to)
}
