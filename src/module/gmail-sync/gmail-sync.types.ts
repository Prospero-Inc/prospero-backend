/**
 * Minimal shapes of the Gmail REST API responses we actually read
 * (`users.messages.list` / `users.messages.get?format=full`). Not the full
 * Gmail API surface — only what `GmailApiClient`/`extractPlainTextBody` use.
 */

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType: string;
  headers?: GmailMessageHeader[];
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessagePayload extends GmailMessagePart {
  headers?: GmailMessageHeader[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  /** Milliseconds since epoch, as a string — Gmail's own serialization. */
  internalDate: string;
  payload: GmailMessagePayload;
}

export interface GmailMessageListItem {
  id: string;
  threadId: string;
}

export interface GmailMessageListResponse {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}
