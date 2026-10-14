import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  async getDashboardStats() {
    const response = await fetch(
      'http://localhost:4000/api/dashboard'
    );

    return await response.json();
  }
}