export interface ServerEntry {
  name: string;
  logo: string | null;
  realmlists: string[];
  realms: string[];
  website: string;
  custom: boolean;
}

export interface CustomServerInput {
  realmlist: string;
  name?: string;
  realm?: string;
}