import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import {
  GmailMessage,
  GmailMessageListItem,
  GmailMessageListResponse,
} from '../gmail-sync.types';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Thin wrapper over Gmail's plain REST API — deliberately not the full
 * `googleapis` SDK, mirroring how `gmail-oauth.service.ts` talks to Google's
 * OAuth endpoints directly via `HttpService`. Stateless: every call takes
 * the caller-provided access token, it never knows about users or
 * `GmailConnection` at all (that's `GmailSyncOrchestrator`'s job).
 */
@Injectable()
export class GmailApiClient {
  private readonly logger = new Logger(GmailApiClient.name);

  constructor(private readonly httpService: HttpService) {}

  private authHeaders(accessToken: string) {
    return { headers: { Authorization: `Bearer ${accessToken}` } };
  }

  /** Google's error body on a failed Gmail API call carries the actual
   * reason (`insufficientPermissions`, `accessNotConfigured`,
   * `quotaExceeded`, ...) that a bare `AxiosError` message never does — log
   * it before rethrowing so a 403/400 is diagnosable from this service's
   * own logs instead of a generic "Request failed with status code N". */
  private logGoogleErrorDetail(error: unknown, context: string): void {
    if (isAxiosError(error)) {
      this.logger.error(
        `${context} failed (status ${error.response?.status}): ${JSON.stringify(
          error.response?.data,
        )}`,
      );
    }
  }

  /** Lists every message id matching `query`, following pagination. */
  async listMessageIds(
    accessToken: string,
    query: string,
  ): Promise<GmailMessageListItem[]> {
    const results: GmailMessageListItem[] = [];
    let pageToken: string | undefined;

    do {
      try {
        const response = await firstValueFrom(
          this.httpService.get<GmailMessageListResponse>(
            `${GMAIL_API_BASE_URL}/messages`,
            {
              ...this.authHeaders(accessToken),
              params: {
                q: query,
                ...(pageToken && { pageToken }),
              },
            },
          ),
        );

        results.push(...(response.data.messages ?? []));
        pageToken = response.data.nextPageToken;
      } catch (error) {
        this.logGoogleErrorDetail(error, 'listMessageIds');
        throw error;
      }
    } while (pageToken);

    return results;
  }

  /** Fetches a single message with its full payload (headers + body parts). */
  async getMessage(
    accessToken: string,
    messageId: string,
  ): Promise<GmailMessage> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GmailMessage>(
          `${GMAIL_API_BASE_URL}/messages/${messageId}`,
          {
            ...this.authHeaders(accessToken),
            params: { format: 'full' },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logGoogleErrorDetail(error, `getMessage(${messageId})`);
      throw error;
    }
  }
}
