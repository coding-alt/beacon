package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/beacon-team/beacon/apps/api/internal/config"
	"github.com/beacon-team/beacon/apps/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Server struct {
	db     *gorm.DB
	cfg    config.Config
	broker *Broker
}

type contextKey string

const userIDKey contextKey = "userID"

func NewServer(db *gorm.DB, cfg config.Config) *Server {
	return &Server{
		db:     db,
		cfg:    cfg,
		broker: NewBroker(),
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(s.cors)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)

		r.Group(func(r chi.Router) {
			r.Use(s.auth)

			r.Get("/me", s.me)
			r.Patch("/me/password", s.changePassword)

			r.Get("/workspaces", s.listWorkspaces)
			r.Post("/workspaces", s.createWorkspace)
			r.Patch("/workspaces/{workspaceID}", s.updateWorkspace)
			r.Delete("/workspaces/{workspaceID}", s.deleteWorkspace)
			r.Get("/workspaces/{workspaceID}/members", s.listWorkspaceMembers)
			r.Post("/workspaces/{workspaceID}/members", s.inviteWorkspaceMember)
			r.Delete("/workspaces/{workspaceID}/members/{memberID}", s.deleteWorkspaceMember)
			r.Get("/workspaces/{workspaceID}/boards", s.listBoards)
			r.Post("/workspaces/{workspaceID}/boards", s.createBoard)

			r.Get("/boards/{boardID}", s.getBoard)
			r.Patch("/boards/{boardID}", s.updateBoard)
			r.Get("/boards/{boardID}/events", s.boardEvents)
			r.Post("/boards/{boardID}/lists", s.createList)
			r.Patch("/boards/{boardID}/lists/reorder", s.reorderLists)
			r.Post("/boards/{boardID}/cards", s.createCard)
			r.Patch("/boards/{boardID}/cards/reorder", s.reorderCards)
			r.Post("/boards/{boardID}/labels", s.createLabel)

			r.Patch("/lists/{listID}", s.updateList)
			r.Delete("/lists/{listID}/permanent", s.deleteList)

			r.Patch("/cards/{cardID}", s.updateCard)
			r.Delete("/cards/{cardID}/permanent", s.deleteCard)
			r.Post("/cards/{cardID}/comments", s.createComment)
			r.Post("/cards/{cardID}/checklists", s.createChecklist)
			r.Post("/cards/{cardID}/labels/{labelID}", s.attachLabel)
			r.Delete("/cards/{cardID}/labels/{labelID}", s.detachLabel)
			r.Post("/cards/{cardID}/members/{memberID}", s.attachMember)
			r.Delete("/cards/{cardID}/members/{memberID}", s.detachMember)
			r.Delete("/labels/{labelID}", s.deleteLabel)

			r.Post("/checklists/{checklistID}/items", s.createChecklistItem)
			r.Patch("/checklist-items/{itemID}", s.updateChecklistItem)
			r.Delete("/checklist-items/{itemID}", s.deleteChecklistItem)
		})
	})

	return r
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed := s.allowedOrigin(origin); allowed != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowed)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowedOrigin(origin string) string {
	if s.cfg.ClientOrigin == "*" {
		return "*"
	}

	for _, allowed := range strings.Split(s.cfg.ClientOrigin, ",") {
		allowed = strings.TrimSpace(allowed)
		if allowed != "" && (origin == allowed || origin == "") {
			return allowed
		}
	}

	return ""
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}
		if tokenString == "" {
			errorJSON(w, http.StatusUnauthorized, "missing bearer token")
			return
		}

		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return []byte(s.cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			errorJSON(w, http.StatusUnauthorized, "invalid token")
			return
		}

		userID, err := claimUint(claims["sub"])
		if err != nil {
			errorJSON(w, http.StatusUnauthorized, "invalid token subject")
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Name == "" || req.Email == "" || len(req.Password) < 8 {
		errorJSON(w, http.StatusBadRequest, "name, email and an 8+ character password are required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not secure password")
		return
	}

	user := models.User{Name: req.Name, Email: req.Email, PasswordHash: string(hash)}
	workspaceName := req.Name + " 的工作区"
	var workspace models.Workspace

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		workspace = models.Workspace{Name: workspaceName, Slug: slugify(workspaceName), OwnerID: user.ID}
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}
		member := models.WorkspaceMember{WorkspaceID: workspace.ID, UserID: user.ID, Role: "owner"}
		return tx.Create(&member).Error
	})
	if err != nil {
		errorJSON(w, http.StatusConflict, "email is already registered")
		return
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"token":     token,
		"user":      user,
		"workspace": workspace,
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	var user models.User
	err := s.db.Where("email = ?", strings.ToLower(strings.TrimSpace(req.Email))).First(&user).Error
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		errorJSON(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	var user models.User
	if err := s.db.First(&user, currentUserID(r)).Error; err != nil {
		errorJSON(w, http.StatusUnauthorized, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, user)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.NewPassword) < 8 {
		errorJSON(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}
	if req.CurrentPassword == req.NewPassword {
		errorJSON(w, http.StatusBadRequest, "new password must be different from current password")
		return
	}

	var user models.User
	if err := s.db.First(&user, currentUserID(r)).Error; err != nil {
		errorJSON(w, http.StatusUnauthorized, "user not found")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)) != nil {
		errorJSON(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not secure password")
		return
	}
	if err := s.db.Model(&user).Update("password_hash", string(hash)).Error; err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not update password")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) issueToken(userID uint) (string, error) {
	claims := jwt.MapClaims{
		"sub": strconv.FormatUint(uint64(userID), 10),
		"exp": time.Now().Add(14 * 24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorJSON(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}

	return true
}

func currentUserID(r *http.Request) uint {
	userID, _ := r.Context().Value(userIDKey).(uint)
	return userID
}

func paramUint(r *http.Request, name string) (uint, error) {
	raw := chi.URLParam(r, name)
	id, err := strconv.ParseUint(raw, 10, 64)
	return uint(id), err
}

func claimUint(value any) (uint, error) {
	switch v := value.(type) {
	case string:
		id, err := strconv.ParseUint(v, 10, 64)
		return uint(id), err
	case float64:
		return uint(v), nil
	default:
		return 0, errors.New("invalid uint claim")
	}
}

func slugify(value string) string {
	slug := strings.ToLower(strings.TrimSpace(value))
	slug = strings.ReplaceAll(slug, " ", "-")
	if slug == "" {
		return "workspace"
	}

	return slug
}
