import vault from 'node-vault';
import { VaultConfig } from './config.js';

export interface VaultSecret {
  path: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export class VaultClient {
  private client: any;
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = config;
    this.client = vault({
      endpoint: config.endpoint,
      token: config.token,
    });
  }

  private isPathAllowed(path: string): boolean {
    if (!this.config.allowedPaths || this.config.allowedPaths.length === 0) {
      return true;
    }
    
    return this.config.allowedPaths.some(allowedPath => 
      path.startsWith(allowedPath)
    );
  }

  private checkReadPermission(): void {
    if (!this.config.permissions.read) {
      throw new Error('Read operations are not permitted');
    }
  }

  private checkWritePermission(): void {
    if (!this.config.permissions.write) {
      throw new Error('Write operations are not permitted');
    }
  }

  async readSecret(path: string): Promise<VaultSecret | null> {
    this.checkReadPermission();
    
    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      const result = await this.client.read(path);
      
      return {
        path,
        data: result.data?.data || result.data || {},
        metadata: result.data?.metadata,
      };
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return null;
      }
      throw new Error(`Failed to read secret at '${path}': ${error.message}`);
    }
  }

  async writeSecret(path: string, data: Record<string, any>): Promise<void> {
    this.checkWritePermission();
    
    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      // KV v2 엔진의 경우 data 래핑이 필요
      await this.client.write(path, { data });
    } catch (error: any) {
      throw new Error(`Failed to write secret to '${path}': ${error.message}`);
    }
  }

  async deleteSecret(path: string): Promise<void> {
    this.checkWritePermission();
    
    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      await this.client.delete(path);
    } catch (error: any) {
      throw new Error(`Failed to delete secret at '${path}': ${error.message}`);
    }
  }

  async listSecrets(path: string): Promise<string[]> {
    this.checkReadPermission();
    
    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      const result = await this.client.list(path);
      return result.data?.keys || [];
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return [];
      }
      throw new Error(`Failed to list secrets at '${path}': ${error.message}`);
    }
  }

  async getHealth(): Promise<{ initialized: boolean; sealed: boolean; standby: boolean }> {
    try {
      const result = await this.client.health();
      return {
        initialized: result.initialized,
        sealed: result.sealed,
        standby: result.standby,
      };
    } catch (error: any) {
      throw new Error(`Failed to get Vault health: ${error.message}`);
    }
  }
}