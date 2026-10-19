import {
  HttpClient,
  HttpDownloadProgressEvent,
  HttpEvent,
  HttpEventType
} from '@angular/common/http';
import { inject, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, catchError, distinct, filter, firstValueFrom, startWith, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export type ServerID =
  | 'echo-ping'
  | 'customer-query'
  | 'itinerary-planning'
  | 'destination-recommendation';

export type Tools = {
  id: ServerID;
  name: string;
  url: string;
  reachable: boolean;
  tools: object[];
  selected: boolean;
};

// Interface for SSE event types
export interface ChatEvent {
  type: 'metadata' | 'error' | 'end';
  agent?: string;
  event?: string | { [key: string]: any };
  data?: any;
  message?: string;
  statusCode?: number;
  agentName?: string;
  kind?: string;
}

export type ChatEventErrorType = 'client' | 'server' | 'general' | undefined;
export interface ChatStreamState {
  id?: number;
  event: ChatEvent;
  type: 'START' | 'END' | 'ERROR' | 'MESSAGE';
  error?: {
    type: ChatEventErrorType;
    message: string;
    statusCode: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    events?: ChatEvent[] | null;
  };
  reasoning: {
    content: string;
  }[];
}

export interface SupportContext {
  bookingReference?: string;
  passengerName?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  falconFlyerTier?: string;
  bookingStatus?: string;
  preferredLanguage?: 'en' | 'ar';
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DemoFlightSearch {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabin: 'Economy' | 'Falcon Gold';
}

export interface DemoFlightOption extends DemoFlightSearch {
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  fare: string;
  pricePerPassenger: number;
  totalPrice: number;
}

export interface DemoBooking extends DemoFlightOption {
  bookingReference: string;
  passengerId: string;
  passengerName: string;
  status: 'Confirmed (demo)';
  createdAt: string;
}

export interface DemoSupportCase {
  caseId: string;
  passengerId: string;
  passengerName: string;
  bookingReference?: string;
  flightNumber?: string;
  category: 'Disruption' | 'Baggage' | 'Refund' | 'Check-in' | 'FalconFlyer' | 'Special assistance' | 'Sensitive escalation' | 'Other';
  description: string;
  assignedQueue: string;
  status: 'Created (demo only - not sent)';
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  ngZone = inject(NgZone);
  private readonly http = inject(HttpClient);
  private apiUrl = environment.apiLangChainJsServer.url;
  chatStreamState = new BehaviorSubject<Partial<ChatStreamState>>({});

 // Track both position and incomplete JSON
  private lastProcessedIndex = 0;
  private incompleteJsonBuffer = '';

  async getAvailableApiUrls(): Promise<{ label: string; url: string, isOnline: boolean }[]> {
    const configuredApis = [
      {
        ...environment.apiLangChainJsServer,
      },
      {
        ...environment.apiLlamaIndexTsServer,
      },
      {
        ...environment.apiMafPythonServer,
      },
    ].filter(api => api.url.trim().length > 0);

    return Promise.all(configuredApis.map(async api => ({
      ...api,
      isOnline: await this.checkApiHealth(api.url),
    })));
  }

  private async checkApiHealth(url: string): Promise<boolean> {
    const healthUrl = `${url}/api/health`;
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.error(`Health check failed for ${healthUrl}:`);
      return false;
    }
  }

  setApiUrl(url: string) {
    this.apiUrl = url.trim() || environment.apiLangChainJsServer.url;
  }

  async initializeApiUrlToDefault() {
    const apiUrls = await this.getAvailableApiUrls();
    const onlineApi = apiUrls.find(api => api.isOnline);
    if (onlineApi) {
      this.apiUrl = onlineApi.url;
    } else if (apiUrls.length > 0) {
      this.apiUrl = apiUrls[0].url;
    } else {
      throw new Error('No API URLs are configured.');
    }
  }

  async fetchAvailableTools(): Promise<{ tools: Tools[] } | void> {

    if (!this.apiUrl) {
      await this.initializeApiUrlToDefault();
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const { error } = await response.json();
        return this.handleApiError(
          new Error(error || 'An error occurred while fetching tools'),
          response.status
        );
      }
      return await response.json();
    } catch (error) {
      return this.handleApiError(error, 0);
    }
  }

  stream(
    message: string,
    tools: Tools[],
    customerContext: SupportContext = {},
    conversationHistory: ConversationTurn[] = [],
  ) {
    // Reset trackers for each new stream
    this.lastProcessedIndex = 0;
    this.incompleteJsonBuffer = '';

    return this.http
      .post(
        `${this.apiUrl}/api/chat`,
        { message, tools, customerContext, conversationHistory },
        {
          responseType: 'text',
          observe: 'events',
          reportProgress: true,
        }
      )
      .pipe(
        filter(
          (event: HttpEvent<string>): boolean =>
            event.type === HttpEventType.DownloadProgress ||
            event.type === HttpEventType.Response
        ),
        switchMap((event: HttpEvent<string>): any => {
          // NOTE: partialText is cumulative! it contains all the data received so far, not just the new chunk.
          // We need to track what we've already processed and only handle the new data.
          const fullText = (event as HttpDownloadProgressEvent).partialText! || '';

          // Extract only the NEW data
          const newData = fullText.substring(this.lastProcessedIndex);
          this.lastProcessedIndex = fullText.length;

          if (!newData.trim()) {
            return [];
          }

          // Combine with any incomplete JSON from previous chunk
          const dataToProcess = this.incompleteJsonBuffer + newData;

          // Split by double newlines
          const parts = dataToProcess.split(/\n\n+/);

          // The last part might be incomplete, save it for next time
          // (unless this is the final Response event)
          if (event.type !== HttpEventType.Response) {
            this.incompleteJsonBuffer = parts.pop() || '';
          } else {
            this.incompleteJsonBuffer = '';
          }

          return parts.map((jsonValue: string) => {
            try {
              const parsedData = JSON.parse(
                jsonValue.replace(/data:\s+/, '').trim()
              );
              return {
                type: event.type === HttpEventType.Response ? 'END' : 'MESSAGE',
                event: parsedData,
                id: Date.now(),
              };
            } catch (error) {
              this.handleApiError(error, 0);
              return null;
            }
          });
        }),
        distinct(),
        catchError((error) => {
          this.handleApiError(error, 0);
          throw error;
        }),
        filter((state) => state !== null),
        startWith<any>({ type: 'START', id: Date.now() }),
      );
  }

  async searchDemoFlights(search: DemoFlightSearch): Promise<DemoFlightOption[]> {
    const response = await firstValueFrom(
      this.http.post<{ flights: DemoFlightOption[] }>(`${this.apiUrl}/api/demo/flights/search`, search),
    );
    return response.flights;
  }

  async createDemoBooking(input: {
    passengerId: string;
    passengerName: string;
    flight: DemoFlightOption;
  }): Promise<DemoBooking> {
    const response = await firstValueFrom(
      this.http.post<{ booking: DemoBooking }>(`${this.apiUrl}/api/demo/bookings`, input),
    );
    return response.booking;
  }

  async getDemoBookings(passengerId: string): Promise<DemoBooking[]> {
    const response = await firstValueFrom(
      this.http.get<{ bookings: DemoBooking[] }>(
        `${this.apiUrl}/api/demo/bookings?passengerId=${encodeURIComponent(passengerId)}`,
      ),
    );
    return response.bookings;
  }

  async createDemoSupportCase(input: {
    passengerId: string;
    passengerName: string;
    bookingReference?: string;
    flightNumber?: string;
    category: DemoSupportCase['category'];
    description: string;
  }): Promise<DemoSupportCase> {
    const response = await firstValueFrom(
      this.http.post<{ supportCase: DemoSupportCase }>(`${this.apiUrl}/api/demo/cases`, input),
    );
    return response.supportCase;
  }

  async getDemoSupportCases(passengerId: string): Promise<DemoSupportCase[]> {
    const response = await firstValueFrom(
      this.http.get<{ cases: DemoSupportCase[] }>(
        `${this.apiUrl}/api/demo/cases?passengerId=${encodeURIComponent(passengerId)}`,
      ),
    );
    return response.cases;
  }

  private handleApiError(error: unknown, statusCode: number) {
    console.error('Fetch error:', error);
    let errorType: ChatEventErrorType = 'general';

    this.chatStreamState.next({
      id: Date.now(),
      type: 'ERROR',
      error: {
        type: errorType,
        message: (error as Error).toString(),
        statusCode,
      },
    });
  }
}
