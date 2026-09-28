// Pure message logic. A slot is messages/<recipient>:
//   { note: { text, sentAt }, read: <sentAt of the message that was read> }
//
// `read` stores the message's own sentAt rather than "when it was read", so
// unread is an exact equality check and nothing compares two machines'
// clocks.

export function hasMessage(slot) {
  return Boolean(slot && slot.note && slot.note.text);
}

export function isUnread(slot) {
  return hasMessage(slot) && slot.read !== slot.note.sentAt;
}

export function chipLabel(unread, sealed) {
  if (!unread) return "Message";
  return sealed ? "message when you're done" : "1 message — read it";
}

// The sender's view of their own outgoing message.
export function outboxStatus(outbox, recipientName, formatTime) {
  if (!hasMessage(outbox)) return "nothing waiting";
  if (!isUnread(outbox)) return "read " + formatTime(outbox.read) + " · send another";
  return "waiting for " + recipientName;
}
