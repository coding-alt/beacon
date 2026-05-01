package httpapi

import (
	"encoding/json"
	"sync"
	"time"
)

type Broker struct {
	mu          sync.Mutex
	subscribers map[uint]map[chan []byte]struct{}
}

func NewBroker() *Broker {
	return &Broker{subscribers: make(map[uint]map[chan []byte]struct{})}
}

func (b *Broker) Subscribe(boardID uint) (<-chan []byte, func()) {
	ch := make(chan []byte, 8)

	b.mu.Lock()
	if _, ok := b.subscribers[boardID]; !ok {
		b.subscribers[boardID] = make(map[chan []byte]struct{})
	}
	b.subscribers[boardID][ch] = struct{}{}
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		if subs, ok := b.subscribers[boardID]; ok {
			delete(subs, ch)
			if len(subs) == 0 {
				delete(b.subscribers, boardID)
			}
		}
		b.mu.Unlock()
		close(ch)
	}

	return ch, cancel
}

func (b *Broker) Publish(boardID uint, eventType string) {
	payload, _ := json.Marshal(map[string]any{
		"type":    eventType,
		"boardId": boardID,
		"at":      time.Now().UTC().Format(time.RFC3339Nano),
	})

	b.mu.Lock()
	defer b.mu.Unlock()

	for ch := range b.subscribers[boardID] {
		select {
		case ch <- payload:
		default:
		}
	}
}
