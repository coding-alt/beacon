package models

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"not null" json:"name"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	AvatarURL    string    `json:"avatarUrl"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Workspace struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Slug      string    `gorm:"index" json:"slug"`
	OwnerID   uint      `gorm:"not null" json:"ownerId"`
	Boards    []Board   `json:"boards,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type WorkspaceMember struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkspaceID uint      `gorm:"uniqueIndex:idx_workspace_user;not null" json:"workspaceId"`
	UserID      uint      `gorm:"uniqueIndex:idx_workspace_user;not null" json:"userId"`
	Role        string    `gorm:"not null;default:member" json:"role"`
	User        User      `json:"user"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Board struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkspaceID uint      `gorm:"index;not null" json:"workspaceId"`
	Workspace   Workspace `json:"-"`
	Name        string    `gorm:"not null" json:"name"`
	Description string    `json:"description"`
	Color       string    `gorm:"not null;default:'#0f766e'" json:"color"`
	Starred     bool      `json:"starred"`
	Visibility  string    `gorm:"not null;default:workspace" json:"visibility"`
	CreatedByID uint      `gorm:"not null" json:"createdById"`
	Lists       []List    `json:"lists,omitempty"`
	Labels      []Label   `json:"labels,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type List struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BoardID   uint      `gorm:"index;not null" json:"boardId"`
	Name      string    `gorm:"not null" json:"name"`
	Position  int       `gorm:"not null" json:"position"`
	Cards     []Card    `json:"cards,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Card struct {
	ID                   uint        `gorm:"primaryKey" json:"id"`
	BoardID              uint        `gorm:"index;not null" json:"boardId"`
	ListID               uint        `gorm:"index;not null" json:"listId"`
	Title                string      `gorm:"not null" json:"title"`
	Description          string      `json:"description"`
	Position             int         `gorm:"not null" json:"position"`
	CoverColor           string      `json:"coverColor"`
	Delayed              bool        `json:"delayed"`
	Priority             string      `json:"priority"`
	Summary              string      `json:"summary"`
	StartDate            *time.Time  `json:"startDate"`
	DueDate              *time.Time  `json:"dueDate"`
	CompletedAt          *time.Time  `json:"completedAt"`
	Progress             string      `json:"progress"`
	LatestProgressRecord string      `json:"latestProgressRecord"`
	OwnerID              *uint       `gorm:"index" json:"ownerId"`
	Owner                *User       `json:"owner,omitempty"`
	CreatedByID          uint        `gorm:"not null" json:"createdById"`
	Labels               []Label     `gorm:"many2many:card_labels;" json:"labels,omitempty"`
	Members              []User      `gorm:"many2many:card_members;" json:"members,omitempty"`
	Checklists           []Checklist `json:"checklists,omitempty"`
	Comments             []Comment   `json:"comments,omitempty"`
	CreatedAt            time.Time   `json:"createdAt"`
	UpdatedAt            time.Time   `json:"updatedAt"`
}

type Label struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BoardID   uint      `gorm:"index;not null" json:"boardId"`
	Name      string    `gorm:"not null" json:"name"`
	Color     string    `gorm:"not null" json:"color"`
	Position  int       `gorm:"not null" json:"position"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Checklist struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	CardID    uint            `gorm:"index;not null" json:"cardId"`
	Title     string          `gorm:"not null" json:"title"`
	Position  int             `gorm:"not null" json:"position"`
	Items     []ChecklistItem `json:"items,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type ChecklistItem struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ChecklistID uint      `gorm:"index;not null" json:"checklistId"`
	Title       string    `gorm:"not null" json:"title"`
	Checked     bool      `json:"checked"`
	Position    int       `gorm:"not null" json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Comment struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CardID    uint      `gorm:"index;not null" json:"cardId"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	User      User      `json:"user"`
	Body      string    `gorm:"not null" json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Activity struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BoardID   uint      `gorm:"index;not null" json:"boardId"`
	CardID    *uint     `gorm:"index" json:"cardId"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Action    string    `gorm:"not null" json:"action"`
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"createdAt"`
}
