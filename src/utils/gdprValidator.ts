import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { GDPRComplianceError } from './errorHandler.js';

export class GDPRValidator {
  private static blockedWorkItemTypes: Set<string> = new Set();
  private static initialized = false;

  static initialize(blockedTypes: string[]): void {
    this.blockedWorkItemTypes = new Set(blockedTypes.map(type => type.toLowerCase()));
    this.initialized = true;
    console.log(`[GDPR] Initialized with blocked work item types: ${Array.from(this.blockedWorkItemTypes).join(', ')}`);
  }

  static validate(workItem: WorkItem): void {
    if (!this.initialized) {
      throw new Error('GDPRValidator must be initialized before use');
    }

    if (!workItem.id) {
      throw new Error('Work item must have an ID');
    }

    if (!workItem.fields) {
      throw new Error('Work item must have fields');
    }

    const workItemType = workItem.fields['System.WorkItemType'];

    if (!workItemType) {
      throw new Error('Work item must have a type (System.WorkItemType field)');
    }

    const normalizedType = String(workItemType).toLowerCase();

    if (this.blockedWorkItemTypes.has(normalizedType)) {
      console.log(`[GDPR] Blocked access to work item #${workItem.id} of type "${workItemType}"`);
      throw new GDPRComplianceError(workItem.id, workItemType);
    }

    console.log(`[GDPR] Allowed access to work item #${workItem.id} of type "${workItemType}"`);
  }

  static isBlocked(workItemType: string): boolean {
    if (!this.initialized) {
      throw new Error('GDPRValidator must be initialized before use');
    }
    return this.blockedWorkItemTypes.has(workItemType.toLowerCase());
  }

  static getBlockedTypes(): string[] {
    return Array.from(this.blockedWorkItemTypes);
  }
}
