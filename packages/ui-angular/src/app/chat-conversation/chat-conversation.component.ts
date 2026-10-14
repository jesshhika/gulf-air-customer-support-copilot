import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ChatMessage } from '../services/api.service';
import { DashboardService } from '../services/dashboard.service';
import { ChatService } from './chat-conversation.service';

interface PassengerProfile {
  id: string;
  name: string;
  email: string;
  bookingReference: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  seat: string;
  falconFlyerTier: string;
  bookingStatus: string;
  sentiment: string;
  cases: string[];
  flags: string[];
}

interface FlightOption {
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  fare: string;
  price: number;
}

const SAMPLE_PASSENGERS: PassengerProfile[] = [
  { id: 'ahmed', name: 'Ahmed Ali', email: 'ahmed@gulfairdemo.com', bookingReference: 'GA12345', flightNumber: 'GF123', origin: 'BAH', destination: 'LHR', departure: '14 Oct · 08:40', seat: '12C', falconFlyerTier: 'Gold', bookingStatus: 'Delayed · 3h', sentiment: 'Needs an update', cases: ['Baggage delay · resolved', 'Seat change · resolved'], flags: ['Tight connection', 'Arabic preferred'] },
  { id: 'fatima', name: 'Fatima Hassan', email: 'fatima@gulfairdemo.com', bookingReference: 'GA67890', flightNumber: 'GF210', origin: 'BAH', destination: 'DXB', departure: '14 Oct · 11:20', seat: '18A', falconFlyerTier: 'Silver', bookingStatus: 'Not checked in', sentiment: 'Neutral', cases: ['Seat selection · resolved'], flags: ['Family travel'] },
  { id: 'omar', name: 'Omar Saleh', email: 'omar@gulfairdemo.com', bookingReference: 'GA11223', flightNumber: 'GF450', origin: 'BAH', destination: 'JED', departure: '15 Oct · 06:15', seat: '22D', falconFlyerTier: 'Blue', bookingStatus: 'Confirmed', sentiment: 'Neutral', cases: [], flags: [] },
  { id: 'noor', name: 'Noor Ahmed', email: 'noor@gulfairdemo.com', bookingReference: 'GA77881', flightNumber: 'GF107', origin: 'BAH', destination: 'LHR', departure: '15 Oct · 09:10', seat: '10A', falconFlyerTier: 'Gold', bookingStatus: 'Checked in', sentiment: 'Positive', cases: ['FalconFlyer enquiry · resolved'], flags: ['Window seat'] },
  { id: 'khalid', name: 'Khalid Yusuf', email: 'khalid@gulfairdemo.com', bookingReference: 'GA99112', flightNumber: 'GF515', origin: 'BAH', destination: 'MED', departure: '16 Oct · 14:30', seat: '14F', falconFlyerTier: 'Black', bookingStatus: 'Confirmed', sentiment: 'Neutral', cases: [], flags: ['FalconFlyer Black'] },
  { id: 'mariam', name: 'Mariam Hassan', email: 'mariam@gulfairdemo.com', bookingReference: 'GA88117', flightNumber: 'GF513', origin: 'BAH', destination: 'DAC', departure: '16 Oct · 22:10', seat: '19B', falconFlyerTier: 'Silver', bookingStatus: 'Confirmed', sentiment: 'Neutral', cases: ['Baggage allowance · resolved'], flags: ['Halal meal'] },
  { id: 'sara', name: 'Sara Ali', email: 'sara@gulfairdemo.com', bookingReference: 'GA66778', flightNumber: 'GF102', origin: 'BAH', destination: 'DEL', departure: '17 Oct · 01:45', seat: '25C', falconFlyerTier: 'Blue', bookingStatus: 'Checked in', sentiment: 'Neutral', cases: [], flags: [] },
];

const PROFILE_STORAGE_KEY = 'gulf-air-demo-passengers';
const SESSION_STORAGE_KEY = 'gulf-air-demo-active-passenger';

@Component({
  selector: 'app-chat-conversation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-conversation.component.html',
  styleUrl: './chat-conversation.component.css',
})
export class ChatConversationComponent implements OnInit {
  readonly messages: ChatMessage[] = [];
  readonly passengers = signal<PassengerProfile[]>([...SAMPLE_PASSENGERS]);
  readonly selectedPassengerId = signal('');
  readonly selectedPassenger = computed(
    () => this.passengers().find((passenger) => passenger.id === this.selectedPassengerId()) ?? null,
  );
  readonly isSignedIn = signal(false);
  readonly selectedLanguage = signal<'en' | 'ar'>('en');
  readonly darkMode = signal(false);
  readonly activePanel = signal<'workspace' | 'booking'>('workspace');
  readonly bookingConfirmation = signal('');
  readonly handoffSummary = signal('');
  readonly flightOptions = signal<FlightOption[]>([]);
  readonly eot = viewChild<ElementRef<HTMLElement>>('eot');

  loginEmail = '';
  newPassengerName = '';
  newPassengerEmail = '';
  loginError = '';
  accountFormOpen = false;
  bookingOrigin = 'BAH';
  bookingDestination = 'LHR';
  bookingDate = '';
  bookingTravelers = 1;
  bookingCabin = 'Economy';
  dashboardStats: Record<string, any> = {};

  readonly airportOptions = [
    { code: 'BAH', city: 'Bahrain' },
    { code: 'LHR', city: 'London Heathrow' },
    { code: 'DXB', city: 'Dubai' },
    { code: 'JED', city: 'Jeddah' },
    { code: 'MED', city: 'Madinah' },
    { code: 'DAC', city: 'Dhaka' },
    { code: 'DEL', city: 'Delhi' },
  ];

  readonly quickActions = [
    { label: 'Flight status', labelAr: 'حالة الرحلة', icon: '✈', prompt: 'Can you check the status of my flight?' },
    { label: 'Change booking', labelAr: 'تعديل الحجز', icon: '↗', prompt: 'I would like to review options to change my booking.' },
    { label: 'Baggage', labelAr: 'الأمتعة', icon: '▣', prompt: 'What baggage allowance applies to my journey?' },
    { label: 'Refund', labelAr: 'استرداد المبلغ', icon: '↩', prompt: 'I need help understanding the refund options for my booking.' },
  ];

  constructor(
    public chatService: ChatService,
    private readonly dashboardService: DashboardService,
    private readonly apiService: ApiService,
  ) {
    this.chatService.messagesStream.subscribe((messages) => {
      this.messages.splice(0, this.messages.length, ...messages);
      if (messages.length) {
        setTimeout(() => this.scrollToBottom(), 0);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.restoreDemoProfiles();
    const activeId = typeof window === 'undefined' ? '' : window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '';
    const active = this.passengers().find((passenger) => passenger.id === activeId);
    if (active) {
      this.activatePassenger(active, false);
    }

    try {
      this.dashboardStats = await this.dashboardService.getDashboardStats();
    } catch (error) {
      console.error('Failed to load dashboard stats', error);
    }

    this.apiService.setApiUrl(
      (await this.chatService.fetchAvailableApiUrls()).find((api) => api.isOnline)?.url ?? '',
    );
    await this.chatService.fetchAvailableTools();
  }

  signInWithEmail(): void {
    const email = this.loginEmail.trim().toLowerCase();
    const profile = this.passengers().find((passenger) => passenger.email.toLowerCase() === email);
    if (!profile) {
      this.loginError = 'We could not find that demo profile. Choose a sample passenger or create a local demo profile.';
      return;
    }
    this.activatePassenger(profile);
  }

  createPassengerProfile(): void {
    const name = this.newPassengerName.trim();
    const email = this.newPassengerEmail.trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.loginError = 'Enter your name and a valid email address to create a local demo profile.';
      return;
    }
    if (this.passengers().some((passenger) => passenger.email.toLowerCase() === email)) {
      this.loginError = 'A profile with that email already exists. Sign in with the matching profile instead.';
      return;
    }
    const profile: PassengerProfile = {
      id: `local-${Date.now()}`,
      name,
      email,
      bookingReference: '',
      flightNumber: '',
      origin: '',
      destination: '',
      departure: '',
      seat: 'Not assigned',
      falconFlyerTier: 'Blue',
      bookingStatus: 'No active booking',
      sentiment: 'New passenger',
      cases: [],
      flags: [],
    };
    this.passengers.update((passengers) => [...passengers, profile]);
    this.saveDemoProfiles();
    this.activatePassenger(profile);
  }

  switchPassenger(profile: PassengerProfile): void {
    if (profile.id !== this.selectedPassengerId()) {
      this.activatePassenger(profile);
    }
  }

  signOut(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    this.chatService.resetChat();
    this.chatService.setSupportContext({});
    this.selectedPassengerId.set('');
    this.isSignedIn.set(false);
    this.activePanel.set('workspace');
  }

  chooseLanguage(language: 'en' | 'ar'): void {
    this.selectedLanguage.set(language);
    this.updateSupportContext();
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
  }

  tr(english: string, arabic: string): string {
    return this.selectedLanguage() === 'ar' ? arabic : english;
  }

  toggleDarkMode(): void {
    this.darkMode.update((enabled) => !enabled);
  }

  startNewCase(): void {
    this.chatService.resetChat();
    this.activePanel.set('workspace');
    this.bookingConfirmation.set('');
  }

  sendQuickAction(prompt: string): void {
    const localizedPrompt = this.selectedLanguage() === 'ar'
      ? `${prompt} Please reply in Arabic.`
      : prompt;
    this.chatService.userMessage.set(localizedPrompt);
    this.chatService.sendMessage(new MouseEvent('click'));
  }

  submitMessage(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }
    event.preventDefault();
    this.chatService.sendMessage(event);
  }

  showBooking(): void {
    this.activePanel.set('booking');
    this.bookingConfirmation.set('');
    this.flightOptions.set([]);
  }

  searchFlights(): void {
    if (this.bookingOrigin === this.bookingDestination) {
      this.bookingConfirmation.set('Choose two different airports to search.');
      this.flightOptions.set([]);
      return;
    }
    const dateLabel = this.bookingDate
      ? new Date(`${this.bookingDate}T00:00:00`).toLocaleDateString(this.selectedLanguage() === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short' })
      : 'Selected date';
    this.flightOptions.set([
      { flightNumber: 'GF121', departure: '08:40', arrival: '11:25', duration: '2h 45m', fare: 'Light', price: 185 },
      { flightNumber: 'GF125', departure: '13:15', arrival: '16:00', duration: '2h 45m', fare: 'Smart', price: 242 },
      { flightNumber: 'GF129', departure: '18:30', arrival: '21:15', duration: '2h 45m', fare: 'Flex', price: 318 },
    ].map((flight) => ({
      ...flight,
      departure: `${dateLabel} · ${flight.departure}`,
    })));
    this.bookingConfirmation.set('');
  }

  confirmDemoBooking(flight: FlightOption): void {
    const current = this.selectedPassenger();
    if (!current) {
      return;
    }
    const reference = `GA${String(Math.floor(10000 + Math.random() * 90000))}`;
    const departureDate = this.bookingDate
      ? new Date(`${this.bookingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : 'Date to confirm';
    const updated: PassengerProfile = {
      ...current,
      bookingReference: reference,
      flightNumber: flight.flightNumber,
      origin: this.bookingOrigin,
      destination: this.bookingDestination,
      departure: `${departureDate} · ${flight.departure.split(' · ').pop()}`,
      seat: 'Assigned at check-in',
      bookingStatus: 'Demo booking saved',
      cases: [`New booking · ${flight.flightNumber}`, ...current.cases],
    };
    this.passengers.update((passengers) => passengers.map((passenger) => passenger.id === current.id ? updated : passenger));
    this.saveDemoProfiles();
    this.updateSupportContext();
    this.bookingConfirmation.set(`Demo booking ${reference} saved for ${flight.flightNumber}. No ticket or payment was issued.`);
  }

  insertSuggestedReply(): void {
    const passenger = this.selectedPassenger();
    const draft = passenger
      ? `Hello ${passenger.name}, I’m reviewing your ${passenger.flightNumber || 'Gulf Air'} travel request. I’ll confirm the available options and any applicable policy before making changes.`
      : 'Hello, I’m happy to help. Please share the booking reference and the travel support you need.';
    this.chatService.userMessage.set(draft);
    this.activePanel.set('workspace');
  }

  requestHumanHandoff(): void {
    const passenger = this.selectedPassenger();
    const latestCustomerMessage = [...this.messages].reverse().find((message) => message.role === 'user')?.content;
    this.handoffSummary.set([
      `Passenger: ${passenger?.name || 'Not selected'}`,
      `Booking: ${passenger?.bookingReference || 'None linked'}`,
      `Flight: ${passenger?.flightNumber || 'Not provided'}${passenger?.origin && passenger?.destination ? ` (${passenger.origin} to ${passenger.destination})` : ''}`,
      `FalconFlyer: ${passenger?.falconFlyerTier || 'Unknown'}`,
      `Latest request: ${latestCustomerMessage || 'No conversation message yet'}`,
      'Demo limitation: this note is not sent to a CRM and does not transfer the customer to an agent.',
    ].join('\n'));
  }

  getSupportPriorityLabel(): string {
    const cases = Number(this.dashboardStats['priorityCases'] ?? 0);
    return cases >= 12 ? 'High-priority queue' : cases >= 6 ? 'Escalation-aware queue' : 'Standard operations';
  }

  getPassengerFirstName(): string {
    return this.selectedPassenger()?.name.split(' ')[0] ?? '';
  }

  scrollToBottom(): void {
    this.eot()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  private activatePassenger(profile: PassengerProfile, persist = true): void {
    this.selectedPassengerId.set(profile.id);
    this.isSignedIn.set(true);
    this.loginError = '';
    this.loginEmail = profile.email;
    this.activePanel.set('workspace');
    this.bookingConfirmation.set('');
    this.chatService.resetChat();
    this.updateSupportContext(profile);
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_STORAGE_KEY, profile.id);
    }
  }

  private updateSupportContext(profile = this.selectedPassenger()): void {
    if (!profile) {
      this.chatService.setSupportContext({});
      return;
    }
    this.chatService.setSupportContext({
      bookingReference: profile.bookingReference,
      passengerName: profile.name,
      flightNumber: profile.flightNumber,
      origin: profile.origin,
      destination: profile.destination,
      falconFlyerTier: profile.falconFlyerTier,
      bookingStatus: profile.bookingStatus,
      preferredLanguage: this.selectedLanguage(),
    });
  }

  private restoreDemoProfiles(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const profiles = JSON.parse(stored) as PassengerProfile[];
      if (Array.isArray(profiles)) {
        const storedById = new Map(profiles.filter((passenger) => passenger?.id).map((passenger) => [passenger.id, passenger]));
        const samples = SAMPLE_PASSENGERS.map((passenger) => storedById.get(passenger.id) ?? passenger);
        const custom = profiles.filter((passenger) => passenger?.id?.startsWith('local-'));
        this.passengers.set([...samples, ...custom]);
      }
    } catch (error) {
      console.error('Could not restore local demo passenger profiles', error);
    }
  }

  private saveDemoProfiles(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.passengers()));
    }
  }
}
