import type { DocumentRecord, DocumentFilter, PeopleRepo, DocumentType } from './types.js';
export interface CreateDocumentInput {
    entityId: string;
    employeeId?: string;
    docType: DocumentType;
    title: string;
    storageKey: string;
    expiresOn?: string;
    idempotencyKey: string;
}
export declare function createDocument(input: CreateDocumentInput, repo: PeopleRepo, correlationId: string): Promise<DocumentRecord>;
export declare function listDocuments(filter: DocumentFilter, repo: PeopleRepo): Promise<{
    items: DocumentRecord[];
    nextCursor?: string;
}>;
