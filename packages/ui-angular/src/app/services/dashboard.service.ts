import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  async getDashboardStats() {
    const response = await fetch(`${environment.apiLangChainJsServer.url}/api/dashboard`);
    if (!response.ok) {
      throw new Error(`Dashboard request failed with status ${response.status}`);
    }

    return await response.json();
  }
}