import { SerializationAdapter } from './adapters';

export class JsonSerializer implements SerializationAdapter {
  public serialize(obj: unknown): Buffer {
    return Buffer.from(JSON.stringify(obj), 'utf8');
  }

  public deserialize(data: Buffer): unknown {
    return JSON.parse(data.toString('utf8')) as unknown;
  }

  public validate(schema: unknown, obj: unknown): boolean {
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
      return false;
    }

    const s = schema as Record<string, unknown>;
    if (!Array.isArray(s.required)) {
      return true;
    }

    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }

    const o = obj as Record<string, unknown>;
    return s.required.every((key) => typeof key === 'string' && key in o);
  }
}
