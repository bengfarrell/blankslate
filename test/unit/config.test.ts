import { describe, it, expect, beforeEach } from 'vitest';
import { Config, MappingType } from '../../src/models';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Config Utilities', () => {
  const mockConfigData = {
    name: 'Test Tablet',
    manufacturer: 'Test Manufacturer',
    model: 'Test Model',
    description: 'A test tablet configuration',
    vendorId: '0x1234',
    productId: '0x5678',
    deviceInfo: {
      vendor_id: 0x1234,
      product_id: 0x5678,
      product_string: 'Test Tablet',
      usage_page: 13,
      usage: 2,
      interfaces: [0],
    },
    modes: [
      {
        reportId: 1,
        digitizerUsagePage: 13,
        capabilities: {
          hasButtons: true,
          buttonCount: 8,
          hasPressure: true,
          pressureLevels: 8191,
          hasTilt: true,
          resolution: {
            x: 32768,
            y: 32768,
          },
        },
        byteCodeMappings: {
          status: {
            byteIndex: [0],
            type: MappingType.CODE,
            values: {
              '160': { state: 'stylus' },
            },
          },
          x: {
            byteIndex: [1, 2],
            max: 65535,
            type: MappingType.MULTI_BYTE_RANGE,
          },
          y: {
            byteIndex: [3, 4],
            max: 65535,
            type: MappingType.MULTI_BYTE_RANGE,
          },
          pressure: {
            byteIndex: [5, 6],
            max: 8191,
            type: MappingType.MULTI_BYTE_RANGE,
          },
        },
      }
    ],
  };
  
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = new Config(mockConfigData);
  });

  describe('toJSON', () => {
    it('should convert Config to JSON string (compact)', () => {
      const result = mockConfig.toJSON();
      expect(typeof result).toBe('string');
      expect(result).not.toContain('\n'); // compact format
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe(mockConfig.name);
      expect(parsed.vendorId).toBe(mockConfig.vendorId);
      expect(parsed).toEqual(mockConfigData);
    });

    it('should convert Config to JSON string (pretty)', () => {
      const result = mockConfig.toJSON(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('\n'); // pretty format
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe(mockConfig.name);
      expect(parsed).toEqual(mockConfigData);
    });
  });

  describe('fromJSON', () => {
    it('should parse valid JSON string to Config', () => {
      const jsonString = JSON.stringify(mockConfigData);
      const result = Config.fromJSON(jsonString);
      expect(result).toBeInstanceOf(Config);
      expect(result.name).toBe(mockConfig.name);
      expect(result.vendorId).toBe(mockConfig.vendorId);
      expect(result.getByteCodeMappings()).toEqual(mockConfig.getByteCodeMappings());
    });

    it('should throw error for invalid JSON', () => {
      expect(() => Config.fromJSON('invalid json')).toThrow('Invalid JSON');
    });

    it('should throw error for non-object JSON', () => {
      expect(() => Config.fromJSON('"just a string"')).toThrow('Invalid config: must be an object');
    });

    it('should throw error for missing required fields', () => {
      const incomplete = { name: 'Test' };
      expect(() => Config.fromJSON(JSON.stringify(incomplete))).toThrow('missing required field');
    });

    it('should validate all required fields', () => {
      const requiredFields = [
        'name', 'manufacturer', 'model', 'description',
        'vendorId', 'productId', 'deviceInfo', 'modes'
      ];

      requiredFields.forEach(field => {
        const incomplete = { ...mockConfigData };
        delete (incomplete as any)[field];
        expect(() => Config.fromJSON(JSON.stringify(incomplete))).toThrow(`missing required field '${field}'`);
      });
    });
  });

  describe('load', () => {
    it('should exist as static method', () => {
      // The load function uses fetch, which is a browser API
      // It's tested in integration tests with a real server
      // Here we just verify the function exists and is properly exported
      expect(typeof Config.load).toBe('function');
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain data integrity through toJSON -> fromJSON', () => {
      const jsonString = mockConfig.toJSON();
      const parsed = Config.fromJSON(jsonString);
      expect(parsed).toBeInstanceOf(Config);
      expect(parsed.name).toBe(mockConfig.name);
      expect(parsed.vendorId).toBe(mockConfig.vendorId);
      expect(parsed.getByteCodeMappings()).toEqual(mockConfig.getByteCodeMappings());
    });

    it('should maintain data integrity through toJSON (pretty) -> fromJSON', () => {
      const jsonString = mockConfig.toJSON(true);
      const parsed = Config.fromJSON(jsonString);
      expect(parsed).toBeInstanceOf(Config);
      expect(parsed.name).toBe(mockConfig.name);
      expect(parsed.getByteCodeMappings()).toEqual(mockConfig.getByteCodeMappings());
    });
  });

  describe('Fixture Integration Tests', () => {
    it('should load and parse the test fixture config file', () => {
      // Load the fixture file
      const fixturePath = join(__dirname, '..', 'fixtures', 'test-tablet-config.json');
      const fixtureContent = readFileSync(fixturePath, 'utf-8');

      // Parse it using Config.fromJSON
      const config = Config.fromJSON(fixtureContent);

      // Validate the parsed config
      expect(config).toBeInstanceOf(Config);
      expect(config.name).toBe('Test Tablet');
      expect(config.manufacturer).toBe('Test Manufacturer');
      expect(config.model).toBe('Test Model');
      expect(config.vendorId).toBe('0x1234');
      expect(config.productId).toBe('0x5678');
      expect(config.modes[0].reportId).toBe(1);
      expect(config.getCapabilities()?.hasPressure).toBe(true);
      expect(config.getCapabilities()?.pressureLevels).toBe(8191);
      expect(config.getByteCodeMappings()).toHaveProperty('x');
      expect(config.getByteCodeMappings()).toHaveProperty('y');
      expect(config.getByteCodeMappings()).toHaveProperty('pressure');
    });

    it('should round-trip the fixture file through toJSON/fromJSON', () => {
      // Load the fixture file
      const fixturePath = join(__dirname, '..', 'fixtures', 'test-tablet-config.json');
      const fixtureContent = readFileSync(fixturePath, 'utf-8');

      // Parse, serialize, and parse again
      const config1 = Config.fromJSON(fixtureContent);
      const serialized = config1.toJSON();
      const config2 = Config.fromJSON(serialized);

      // Should have identical properties
      expect(config2.name).toBe(config1.name);
      expect(config2.getByteCodeMappings()).toEqual(config1.getByteCodeMappings());
    });

    it('should validate the fixture file structure', () => {
      const fixturePath = join(__dirname, '..', 'fixtures', 'test-tablet-config.json');
      const fixtureContent = readFileSync(fixturePath, 'utf-8');

      // Should not throw an error
      expect(() => Config.fromJSON(fixtureContent)).not.toThrow();

      const config = Config.fromJSON(fixtureContent);

      // Check all required fields exist
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('manufacturer');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('vendorId');
      expect(config).toHaveProperty('productId');
      expect(config).toHaveProperty('deviceInfo');
      expect(config).toHaveProperty('modes');
      expect(config.modes.length).toBeGreaterThan(0);
      expect(config.modes[0]).toHaveProperty('reportId');
      expect(config.modes[0]).toHaveProperty('capabilities');
      expect(config.modes[0]).toHaveProperty('byteCodeMappings');
    });
  });
});

