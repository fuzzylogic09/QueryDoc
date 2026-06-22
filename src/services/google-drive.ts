const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let accessToken: string | null = null;

const CLIENT_ID_KEY = 'querydoc_google_client_id';

export function getStoredClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || '';
}

export function setStoredClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id);
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

export async function loadGapiScript(): Promise<void> {
  if (document.getElementById('gapi-script')) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = 'gapi-script';
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => {
      gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        resolve();
      });
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function loadGisScript(): Promise<void> {
  if (document.getElementById('gis-script')) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = 'gis-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function authenticate(clientId: string): Promise<string> {
  await loadGapiScript();
  await loadGisScript();
  setStoredClientId(clientId);

  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken!);
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  md5Checksum?: string;
}

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
  'text/plain',
];

export async function listFiles(maxResults: number): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  const typeQuery = SUPPORTED_TYPES
    .map(t => `mimeType='${t}'`)
    .join(' or ');

  while (files.length < maxResults) {
    const response = await gapi.client.drive.files.list({
      pageSize: Math.min(100, maxResults - files.length),
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum)',
      q: `(${typeQuery}) and trashed=false`,
      pageToken,
    });

    const result = response.result;
    if (result.files) {
      files.push(...(result.files as DriveFile[]));
    }
    pageToken = result.nextPageToken as string | undefined;
    if (!pageToken) break;
  }

  return files.slice(0, maxResults);
}

export async function downloadFile(fileId: string, mimeType: string): Promise<ArrayBuffer | string> {
  if (mimeType === 'application/vnd.google-apps.document') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const files = gapi.client.drive.files as any;
    const response = await files.export({
      fileId,
      mimeType: 'text/plain',
    });
    return response.body;
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

  if (mimeType === 'text/plain') {
    return response.text();
  }
  return response.arrayBuffer();
}
