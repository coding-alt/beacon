package httpapi

import (
	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/gorm"
)

func deleteBoardsByIDs(tx *gorm.DB, boardIDs []uint) error {
	if len(boardIDs) == 0 {
		return nil
	}

	var cardIDs []uint
	if err := tx.Model(&models.Card{}).Where("board_id IN ?", boardIDs).Pluck("id", &cardIDs).Error; err != nil {
		return err
	}
	if err := deleteCardsByIDs(tx, cardIDs); err != nil {
		return err
	}
	if err := tx.Where("board_id IN ?", boardIDs).Delete(&models.List{}).Error; err != nil {
		return err
	}
	if err := tx.Where("board_id IN ?", boardIDs).Delete(&models.Label{}).Error; err != nil {
		return err
	}
	if err := tx.Where("board_id IN ?", boardIDs).Delete(&models.Activity{}).Error; err != nil {
		return err
	}

	return tx.Where("id IN ?", boardIDs).Delete(&models.Board{}).Error
}

func deleteListsByIDs(tx *gorm.DB, listIDs []uint) error {
	if len(listIDs) == 0 {
		return nil
	}

	var cardIDs []uint
	if err := tx.Model(&models.Card{}).Where("list_id IN ?", listIDs).Pluck("id", &cardIDs).Error; err != nil {
		return err
	}
	if err := deleteCardsByIDs(tx, cardIDs); err != nil {
		return err
	}

	return tx.Where("id IN ?", listIDs).Delete(&models.List{}).Error
}

func deleteCardsByIDs(tx *gorm.DB, cardIDs []uint) error {
	if len(cardIDs) == 0 {
		return nil
	}

	var checklistIDs []uint
	if err := tx.Model(&models.Checklist{}).Where("card_id IN ?", cardIDs).Pluck("id", &checklistIDs).Error; err != nil {
		return err
	}
	if len(checklistIDs) > 0 {
		if err := tx.Where("checklist_id IN ?", checklistIDs).Delete(&models.ChecklistItem{}).Error; err != nil {
			return err
		}
	}
	if err := tx.Where("card_id IN ?", cardIDs).Delete(&models.Checklist{}).Error; err != nil {
		return err
	}
	if err := tx.Where("card_id IN ?", cardIDs).Delete(&models.Comment{}).Error; err != nil {
		return err
	}
	if err := tx.Where("card_id IN ?", cardIDs).Delete(&models.Activity{}).Error; err != nil {
		return err
	}
	if err := tx.Exec("DELETE FROM card_labels WHERE card_id IN ?", cardIDs).Error; err != nil {
		return err
	}
	if err := tx.Exec("DELETE FROM card_members WHERE card_id IN ?", cardIDs).Error; err != nil {
		return err
	}

	return tx.Where("id IN ?", cardIDs).Delete(&models.Card{}).Error
}
