import { type LeaveRecord, type LeaveRepo } from './create-request.js';
export declare function cancelLeaveRequest(id: string, requesterId: string, expectedVersion: number, correlationId: string, repo: LeaveRepo): Promise<LeaveRecord>;
