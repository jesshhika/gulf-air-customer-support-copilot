import { Injectable, signal } from '@angular/core';

import { toast } from 'ngx-sonner';
import { BehaviorSubject } from 'rxjs';
import {
  ApiService,
  ChatEvent,
  ChatMessage,
  ConversationTurn,
  SupportContext,
  Tools,
} from '../services/api.service';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  userMessage = signal('');
  

  messagesStream = new BehaviorSubject<ChatMessage[]>([]);
  private messagesBuffer: ChatMessage[] = [];
  private agentEventsBuffer: ChatEvent[] = [];

  isLoading = signal(false);
  tools = signal<Tools[]>([]);
  agent = signal<string | null>(null);
  assistantMessageInProgress = signal(false);
  agentMessageBuffer: string = '';
  supportContext = signal<SupportContext>({});

  constructor(private apiService: ApiService) {}

  async fetchAvailableTools() {
    const toolsResult = await this.apiService.fetchAvailableTools();
    if (toolsResult) {
      this.tools.set(toolsResult.tools);
    }
  }

  async fetchAvailableApiUrls() {
    return await this.apiService.getAvailableApiUrls();
  }

  setApiUrl(url: string) {
    this.apiService.setApiUrl(url);
  }

  setSupportContext(context: SupportContext) {
    this.supportContext.set(context);
  }

  async sendMessage(event: Event) {
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }

    const messageText = this.userMessage();
    if (!messageText.trim()) return;

    const conversationHistory: ConversationTurn[] = this.messagesBuffer
      .filter((message) => message.content.trim())
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    this.messagesBuffer.push({
      role: 'user',
      content: messageText,
      reasoning: [],
      timestamp: new Date(),
    });

    this.userMessage.set('');
    this.isLoading.set(true);
    this.assistantMessageInProgress.set(false);

    this.apiService
      .stream(
        messageText,
        this.tools().filter((tool) => tool.selected),
        this.supportContext(),
        conversationHistory
      )
      .subscribe({
        next: (state) => {
          switch (state.type) {
            case 'START':
              this.agentEventsBuffer = [];
              // Always create a fresh assistant message
              this.messagesBuffer = [...this.messagesBuffer];
              const message: ChatMessage = {
                role: 'assistant',
                content: '',
                reasoning: [],
                timestamp: new Date(),
              };
              this.messagesBuffer.push(message);

            

              this.messagesStream.next(this.messagesBuffer);
              
              break;

            case 'END':
  this.isLoading.set(false);

  this.updateAndNotifyAgentChatMessageState('', {
    metadata: {
      events: this.agentEventsBuffer,
    },
  });

  break;
            case 'MESSAGE':
              this.processAgentEvents(state.event);
              break;

            case 'ERROR':
              this.showErrorMessage(state.error);
              this.isLoading.set(false);
              break;

            default:
              break;
          }
        },
        error: (error) => {
          this.showErrorMessage(error);
          this.isLoading.set(false);
        },
      });
  }

  showErrorMessage(error: unknown) {
    const err = (error as any).error ?? error;

    toast.error('Oops! Something went wrong.', {
      duration: 10000,
      description: err.message,
      action: {
        label: 'Close',
        onClick: () => console.log('Closed'),
      },
    });
  }

  private processAgentEvents(state?: ChatEvent) {
    if (state && state.type === 'metadata') {
      this.agent.set(state.data?.agent || null);
      this.agentEventsBuffer.push(state);

      let message = '';

      // MAF events
      if (typeof state.data?.message === 'string') {
        message += state.data.message + '\n';
      }

      let delta: string =
        state.data?.delta || // Llamaindex.TS event
        message || // Microsoft Agent Framework (MAF) event
        '';

      const eventType =
        typeof state.event === 'string' ? state.event : state.event?.['type'];

      switch (eventType) {
        // LlamaIndex events
        case 'llamaindex-start':

        // Microsoft Agent Framework (MAF) events
        case 'WorkflowStarted':
        case 'OrchestratorUserTask':
        case 'OrchestratorInstruction':
          this.updateAndNotifyAgentChatMessageState(delta, {
            metadata: {
              events: this.agentEventsBuffer,
            },
          });

          this.assistantMessageInProgress.set(false);
          break;

        // LlamaIndex events
        case 'llamaindex-stop':

        // Microsoft Agent Framework (MAF) events
case 'agent_complete':

  if (!delta && state.data?.messages?.length) {

    const msg = state.data.messages[0];

    // NEW FORMAT
    if (typeof msg?.content === 'string') {
      delta = msg.content;
    }

    // LANGCHAIN FORMAT
    else if (typeof msg?.kwargs?.content === 'string') {
      delta = msg.kwargs.content;
    }

    // ARRAY FORMAT
    else if (
      msg?.kwargs?.content &&
      Array.isArray(msg.kwargs.content)
    ) {
      delta = msg.kwargs.content
        .map((c: any) => c.text || '')
        .join('');
    }
  }

  console.log("AGENT COMPLETE DELTA:", delta);

  this.updateAndNotifyAgentChatMessageState(delta, {
    metadata: {
      events: this.agentEventsBuffer,
    },
  });

  this.assistantMessageInProgress.set(false);
  this.isLoading.set(false);

  break;
        // LlamaIndex events
        case 'AgentToolCallResult':
          let messageState = {};
          if (typeof state.data.raw === 'string') {
            messageState = {
              reasoning: [
                {
                  content: state.data.raw,
                },
              ],
            };
          }
          this.updateAndNotifyAgentChatMessageState(delta, messageState);
          break;

        // LlamaIndex events
        case 'AgentOutput':
        case 'AgentInput':
        case 'AgentSetup':
        case 'AgentStepEvent':
        case 'AgentToolCall':
        case 'ToolResultsEvent':
        case 'ToolCallsEvent':
          this.updateAndNotifyAgentChatMessageState(delta, {
            metadata: {
              events: this.agentEventsBuffer,
            },
          });
          break;

        // Note: the following events are sent very frequently (per token)

        // LlamaIndex events
        case '4':

        // Microsoft Agent Framework (MAF) events
        case 'AgentDelta':

        // LangChain events
        case 'llm_token':
          if (state.event === 'llm_token') {
            const chunk = state.data?.chunk;
            const content = chunk?.kwargs?.content || [];
            if (Array.isArray(content)) {
              delta = content.map((c) => c.text).join('');
            }
          }

          if (delta.trim()) {
            this.isLoading.set(false);
            // this.assistantMessageInProgress.set(true);
            // this.agentMessageStream.next(this.agentMessageBuffer);
            this.agentEventsBuffer.push(state);
            this.updateAndNotifyAgentChatMessageState(delta, {
              metadata: {
                events: this.agentEventsBuffer,
              },
            });
          }
          break;
      }
    }
  }

  async updateAndNotifyAgentChatMessageState(
    delta: string,
    state?: Partial<ChatMessage>
  ) {
    
    const lastMessage = this.messagesBuffer[this.messagesBuffer.length - 1];
    if (lastMessage?.role === 'assistant') {
      console.log("Updating assistant message:", delta);
      lastMessage.content += delta;
      lastMessage.metadata = {
        ...lastMessage.metadata,
        ...state?.metadata,
        events: state?.metadata?.events,
      };
      lastMessage.reasoning = [
        ...(lastMessage.reasoning || []),
        ...(state?.reasoning || []),
      ];
      lastMessage.timestamp = new Date();

      this.messagesStream.next(this.messagesBuffer);

      
    }
  }

  resetChat() {
    this.userMessage.set('');
    
    this.messagesBuffer = [];
    this.messagesStream.next(this.messagesBuffer);
    this.agentEventsBuffer = [];
    this.isLoading.set(false);
    this.assistantMessageInProgress.set(false);
    this.agent.set(null);
  }
}
