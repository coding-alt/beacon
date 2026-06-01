package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

type boardResponse struct {
	models.Board
	Members []models.WorkspaceMember `json:"members"`
}

func (s *Server) listBoards(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireWorkspaceMember(w, r, workspaceID); !ok {
		return
	}

	var boards []models.Board
	err = s.db.
		Where("workspace_id = ?", workspaceID).
		Order("starred DESC, updated_at DESC").
		Find(&boards).Error
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not list boards")
		return
	}

	respondJSON(w, http.StatusOK, boards)
}

func (s *Server) createBoard(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := paramUint(r, "workspaceID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireWorkspaceMember(w, r, workspaceID); !ok {
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Color       string `json:"color"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		errorJSON(w, http.StatusBadRequest, "board name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#0f766e"
	}

	board := models.Board{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		Color:       req.Color,
		Visibility:  "workspace",
		CreatedByID: currentUserID(r),
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&board).Error; err != nil {
			return err
		}

		defaultLists := []string{"未开始", "进行中", "已完成"}
		for i, name := range defaultLists {
			if err := tx.Create(&models.List{BoardID: board.ID, Name: name, Position: i}).Error; err != nil {
				return err
			}
		}

		defaultLabels := []models.Label{
			{BoardID: board.ID, Name: "产品", Color: "#0f766e", Position: 0},
			{BoardID: board.ID, Name: "设计", Color: "#2563eb", Position: 1},
			{BoardID: board.ID, Name: "研发", Color: "#7c3aed", Position: 2},
			{BoardID: board.ID, Name: "紧急", Color: "#dc2626", Position: 3},
		}
		for _, label := range defaultLabels {
			if err := tx.Create(&label).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not create board")
		return
	}

	s.publishBoardUpdated(board.ID)
	s.respondBoard(w, http.StatusCreated, board.ID)
}

func (s *Server) getBoard(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	s.respondBoard(w, http.StatusOK, boardID)
}

func (s *Server) updateBoard(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Color       *string `json:"color"`
		Starred     *bool   `json:"starred"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			errorJSON(w, http.StatusBadRequest, "board name is required")
			return
		}
		updates["name"] = name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Color != nil {
		updates["color"] = *req.Color
	}
	if req.Starred != nil {
		updates["starred"] = *req.Starred
	}

	if len(updates) > 0 {
		if err := s.db.Model(&models.Board{}).Where("id = ?", boardID).Updates(updates).Error; err != nil {
			errorJSON(w, http.StatusInternalServerError, "could not update board")
			return
		}
	}

	s.publishBoardUpdated(boardID)
	s.respondBoard(w, http.StatusOK, boardID)
}

func (s *Server) boardEvents(w http.ResponseWriter, r *http.Request) {
	boardID, err := paramUint(r, "boardID")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid board id")
		return
	}
	if _, ok := s.requireBoardAccess(w, r, boardID); !ok {
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		errorJSON(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	events, cancel := s.broker.Subscribe(boardID)
	defer cancel()

	fmt.Fprintf(w, "event: beacon\ndata: {\"type\":\"connected\",\"boardId\":%d}\n\n", boardID)
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-events:
			fmt.Fprintf(w, "event: beacon\ndata: %s\n\n", event)
			flusher.Flush()
		}
	}
}

func (s *Server) respondBoard(w http.ResponseWriter, status int, boardID uint) {
	board, err := s.loadBoard(boardID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not load board")
		return
	}

	var members []models.WorkspaceMember
	if err := s.db.Where("workspace_id = ?", board.WorkspaceID).Preload("User").Order("created_at ASC").Find(&members).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not load members")
		return
	}

	respondJSON(w, status, boardResponse{Board: board, Members: members})
}

func (s *Server) loadBoard(boardID uint) (models.Board, error) {
	var board models.Board
	err := s.db.
		Preload("Labels", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lists", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lists.Cards", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lists.Cards.Labels").
		Preload("Lists.Cards.Members").
		Preload("Lists.Cards.Owner").
		Preload("Lists.Cards.Checklists", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lists.Cards.Checklists.Items", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lists.Cards.Comments", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC")
		}).
		Preload("Lists.Cards.Comments.User").
		First(&board, boardID).Error

	for listIndex := range board.Lists {
		for cardIndex := range board.Lists[listIndex].Cards {
			applyComputedCardFields(&board.Lists[listIndex].Cards[cardIndex])
		}
	}

	return board, err
}

func (s *Server) publishBoardUpdated(boardID uint) {
	s.broker.Publish(boardID, "board.updated")
}

func applyComputedCardFields(card *models.Card) {
	if card.DueDate == nil {
		card.Delayed = false
		return
	}

	compareAt := time.Now()
	if card.CompletedAt != nil {
		compareAt = *card.CompletedAt
	}

	card.Delayed = compareAt.After(endOfDay(*card.DueDate))
}

func endOfDay(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 23, 59, 59, int(time.Second-time.Nanosecond), value.Location())
}
