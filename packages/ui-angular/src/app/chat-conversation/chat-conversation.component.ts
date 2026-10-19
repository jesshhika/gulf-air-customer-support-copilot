import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ChatMessage, DemoBooking, DemoFlightOption, DemoSupportCase } from '../services/api.service';
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

interface FlightOption extends DemoFlightOption {
  departure: string;
  arrival: string;
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
  readonly bookingError = signal('');
  readonly latestDemoBooking = signal<DemoBooking | null>(null);
  readonly selectedDemoFlight = signal<FlightOption | null>(null);
  readonly handoffSummary = signal('');
  readonly handoffError = signal('');
  readonly createdDemoCase = signal<DemoSupportCase | null>(null);
  readonly demoCases = signal<DemoSupportCase[]>([]);
  readonly demoWorkflowError = signal('');
  readonly isSearchingFlights = signal(false);
  readonly isCreatingBooking = signal(false);
  readonly isCreatingCase = signal(false);
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
  bookingCabin: DemoFlightOption['cabin'] = 'Economy';
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

    try {
      this.dashboardStats = await this.dashboardService.getDashboardStats();
    } catch (error) {
      console.error('Failed to load dashboard stats', error);
    }

    this.apiService.setApiUrl(
      (await this.chatService.fetchAvailableApiUrls()).find((api) => api.isOnline)?.url ?? '',
    );
    await this.chatService.fetchAvailableTools();
    if (active) {
      this.activatePassenger(active, false);
    }
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
    this.latestDemoBooking.set(null);
    this.createdDemoCase.set(null);
    this.handoffSummary.set('');
    this.handoffError.set('');
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
    this.bookingError.set('');
    this.latestDemoBooking.set(null);
    this.flightOptions.set([]);
    this.selectedDemoFlight.set(null);
  }

  async searchFlights(): Promise<void> {
    this.selectedDemoFlight.set(null);
    this.bookingConfirmation.set('');
    if (this.bookingOrigin === this.bookingDestination) {
      this.bookingError.set('Choose two different airports to search.');
      this.flightOptions.set([]);
      return;
    }
    if (!this.bookingDate) {
      this.bookingError.set('Choose a departure date before searching.');
      this.flightOptions.set([]);
      return;
    }

    this.isSearchingFlights.set(true);
    this.bookingError.set('');
    this.flightOptions.set([]);
    this.latestDemoBooking.set(null);
    try {
      const flights = await this.apiService.searchDemoFlights({
        origin: this.bookingOrigin,
        destination: this.bookingDestination,
        departureDate: this.bookingDate,
        passengers: this.bookingTravelers,
        cabin: this.bookingCabin,
      });
      const dateLabel = new Date(`${this.bookingDate}T00:00:00`).toLocaleDateString(
        this.selectedLanguage() === 'ar' ? 'ar' : 'en-GB',
        { day: 'numeric', month: 'short' },
      );
      this.flightOptions.set(flights.map((flight) => ({
        ...flight,
        departure: `${dateLabel} · ${flight.departureTime}`,
        arrival: flight.arrivalTime,
      })));
      this.selectedDemoFlight.set(null);
    } catch (error) {
      this.bookingError.set(this.getErrorMessage(error, 'Could not search demo flights.'));
    } finally {
      this.isSearchingFlights.set(false);
    }
  }

  async confirmDemoBooking(flight: FlightOption): Promise<void> {
    const current = this.selectedPassenger();
    if (!current) {
      this.bookingError.set('Choose a passenger profile before creating a demo booking.');
      return;
    }
    this.isCreatingBooking.set(true);
    this.bookingError.set('');
    try {
      const booking = await this.apiService.createDemoBooking({
        passengerId: current.id,
        passengerName: current.name,
        flight,
      });
      const departureDate = new Date(`${booking.departureDate}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });
      const updated: PassengerProfile = {
        ...current,
        bookingReference: booking.bookingReference,
        flightNumber: booking.flightNumber,
        origin: booking.origin,
        destination: booking.destination,
        departure: `${departureDate} · ${booking.departureTime}`,
        seat: 'Assigned at check-in',
        bookingStatus: booking.status,
        cases: [`New booking · ${flight.flightNumber}`, ...current.cases],
      };
      this.passengers.update((passengers) => passengers.map((passenger) => passenger.id === current.id ? updated : passenger));
      this.saveDemoProfiles();
      if (this.selectedPassengerId() === current.id) {
        this.updateSupportContext(updated);
        this.latestDemoBooking.set(booking);
        this.selectedDemoFlight.set(null);
        this.bookingConfirmation.set(`Demo booking ${booking.bookingReference} confirmed for ${booking.flightNumber}. No ticket or payment was issued.`);
      }
    } catch (error) {
      this.bookingError.set(this.getErrorMessage(error, 'Could not confirm the demo booking.'));
    } finally {
      this.isCreatingBooking.set(false);
    }
  }

  selectDemoFlight(flight: FlightOption): void {
    this.selectedDemoFlight.set(flight);
    this.bookingError.set('');
    this.bookingConfirmation.set('');
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
    this.createdDemoCase.set(null);
    this.handoffError.set('');
    this.handoffSummary.set([
      `Passenger: ${passenger?.name || 'Not selected'}`,
      `Booking: ${passenger?.bookingReference || 'None linked'}`,
      `Flight: ${passenger?.flightNumber || 'Not provided'}${passenger?.origin && passenger?.destination ? ` (${passenger.origin} to ${passenger.destination})` : ''}`,
      `FalconFlyer: ${passenger?.falconFlyerTier || 'Unknown'}`,
      `Latest request: ${latestCustomerMessage || 'No conversation message yet'}`,
    ].join('\n'));
  }

  async createDemoCase(): Promise<void> {
    const passenger = this.selectedPassenger();
    const latestCustomerMessage = [...this.messages].reverse().find((message) => message.role === 'user')?.content.trim();
    if (!passenger || !latestCustomerMessage) {
      this.handoffError.set('Select a passenger and send a message before creating a support case.');
      return;
    }

    const category = this.getCaseCategory(latestCustomerMessage);
    const description = this.handoffSummary()
      ? `${this.handoffSummary()}\nRequested support: ${category}\nCustomer summary: ${latestCustomerMessage}`
      : `Requested support: ${category}\nCustomer summary: ${latestCustomerMessage}`;
    this.isCreatingCase.set(true);
    this.handoffError.set('');
    try {
      const supportCase = await this.apiService.createDemoSupportCase({
        passengerId: passenger.id,
        passengerName: passenger.name,
        bookingReference: passenger.bookingReference || undefined,
        flightNumber: passenger.flightNumber || undefined,
        category,
        description,
      });
      if (this.selectedPassengerId() === passenger.id) {
        this.demoCases.update((cases) => [supportCase, ...cases]);
        this.createdDemoCase.set(supportCase);
        this.handoffSummary.set('');
        this.handoffError.set('');
      }
    } catch (error) {
      this.handoffError.set(this.getErrorMessage(error, 'Could not create the demo support case.'));
    } finally {
      this.isCreatingCase.set(false);
    }
  }

  downloadBookingConfirmation(booking: DemoBooking): void {
    this.downloadText(
      `gulf-air-demo-booking-${booking.bookingReference}.txt`,
      [
        'Gulf Air - Demo booking confirmation',
        `Reference: ${booking.bookingReference}`,
        `Passenger: ${booking.passengerName}`,
        `Flight: ${booking.flightNumber}`,
        `Route: ${booking.origin} to ${booking.destination}`,
        `Departure: ${booking.departureDate} ${booking.departureTime}`,
        `Arrival: ${booking.arrivalTime}`,
        `Passengers: ${booking.passengers}`,
        `Cabin: ${booking.cabin}`,
        `Sample total: ${booking.totalPrice} BHD`,
        `Status: ${booking.status}`,
        '',
        'Demonstration only. This is not a ticket or proof of payment. No airline reservation or payment system was used.',
      ].join('\n'),
    );
  }

  downloadCaseSummary(supportCase: DemoSupportCase): void {
    this.downloadText(
      `gulf-air-demo-case-${supportCase.caseId}.txt`,
      [
        'Gulf Air - Demo support case',
        `Case ID: ${supportCase.caseId}`,
        `Passenger: ${supportCase.passengerName}`,
        `Booking: ${supportCase.bookingReference || 'Not provided'}`,
        `Flight: ${supportCase.flightNumber || 'Not provided'}`,
        `Category: ${supportCase.category}`,
        `Queue: ${supportCase.assignedQueue}`,
        `Status: ${supportCase.status}`,
        `Created: ${new Date(supportCase.createdAt).toLocaleString()}`,
        '',
        'Case summary:',
        supportCase.description,
        '',
        'Demonstration only. This case was not sent to Gulf Air or a human support team.',
      ].join('\n'),
    );
  }

  getSupportPriorityLabel(): string {
    const cases = Number(this.dashboardStats['demoWorkflowCounts']?.cases ?? 0);
    return `${cases} demo case(s) created`;
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
    this.latestDemoBooking.set(null);
    this.createdDemoCase.set(null);
    void this.loadDemoRecords(profile.id);
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

  private async loadDemoRecords(passengerId: string): Promise<void> {
    this.demoWorkflowError.set('');
    try {
      const [bookings, cases] = await Promise.all([
        this.apiService.getDemoBookings(passengerId),
        this.apiService.getDemoSupportCases(passengerId),
      ]);
      if (this.selectedPassengerId() !== passengerId) return;
      this.demoCases.set(cases);
      const latestBooking = bookings[0];
      if (latestBooking) {
        this.latestDemoBooking.set(latestBooking);
        const passenger = this.passengers().find((profile) => profile.id === passengerId);
        if (passenger && !passenger.bookingReference) {
          const updated: PassengerProfile = {
            ...passenger,
            bookingReference: latestBooking.bookingReference,
            flightNumber: latestBooking.flightNumber,
            origin: latestBooking.origin,
            destination: latestBooking.destination,
            departure: `${latestBooking.departureDate} · ${latestBooking.departureTime}`,
            seat: 'Assigned at check-in',
            bookingStatus: latestBooking.status,
          };
          this.passengers.update((profiles) => profiles.map((profile) => profile.id === passengerId ? updated : profile));
          this.saveDemoProfiles();
          this.updateSupportContext(updated);
        }
      }
    } catch (error) {
      if (this.selectedPassengerId() === passengerId) {
        this.demoWorkflowError.set(this.getErrorMessage(error, 'Could not load demo booking and case history.'));
      }
      console.error('Could not load demo workflow records', error);
    }
  }

  private getCaseCategory(message: string): DemoSupportCase['category'] {
    if (/(medical|bereavement|legal|complaint|harassment|threat|unsafe|emergency)/i.test(message)) return 'Sensitive escalation';
    if (/(delay|late|cancel|divert|missed connection|rebook|disruption)/i.test(message)) return 'Disruption';
    if (/(baggage|luggage|lost bag|damaged bag)/i.test(message)) return 'Baggage';
    if (/(refund|reimburse|compensation)/i.test(message)) return 'Refund';
    if (/(check.?in|boarding|seat)/i.test(message)) return 'Check-in';
    if (/(falconflyer|loyalty|miles|tier)/i.test(message)) return 'FalconFlyer';
    if (/(wheelchair|assistance|accessibility)/i.test(message)) return 'Special assistance';
    return 'Other';
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const responseError = (error as { error?: { error?: string; message?: string } }).error;
      if (responseError?.error) return responseError.error;
      if (responseError?.message) return responseError.message;
    }
    return error instanceof Error ? error.message : fallback;
  }

  private downloadText(filename: string, content: string): void {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
