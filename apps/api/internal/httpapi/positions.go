package httpapi

import (
	"database/sql"

	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

func nextListPosition(tx *gorm.DB, boardID uint) int {
	return nextPosition(tx.Model(&models.List{}).Where("board_id = ?", boardID))
}

func nextCardPosition(tx *gorm.DB, listID uint) int {
	return nextPosition(tx.Model(&models.Card{}).Where("list_id = ?", listID))
}

func nextLabelPosition(tx *gorm.DB, boardID uint) int {
	return nextPosition(tx.Model(&models.Label{}).Where("board_id = ?", boardID))
}

func nextChecklistPosition(tx *gorm.DB, cardID uint) int {
	return nextPosition(tx.Model(&models.Checklist{}).Where("card_id = ?", cardID))
}

func nextChecklistItemPosition(tx *gorm.DB, checklistID uint) int {
	return nextPosition(tx.Model(&models.ChecklistItem{}).Where("checklist_id = ?", checklistID))
}

func nextPosition(query *gorm.DB) int {
	var max sql.NullInt64
	_ = query.Select("MAX(position)").Row().Scan(&max)
	if !max.Valid {
		return 0
	}

	return int(max.Int64) + 1
}
