import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockHIDReader } from '../../src/core/hid/mock-hid-reader.js';
import { TabletDataGenerator } from '../../src/mockbytes/tablet-data-generator.js';

describe('MockHIDReader Translation Support', () => {
  let reader: MockHIDReader;
  let generator: TabletDataGenerator;

  beforeEach(() => {
    generator = new TabletDataGenerator({
      maxX: 16000,
      maxY: 9000,
    });

    reader = new MockHIDReader({
      reportId: 8,
      packetInterval: 5,
    });
  });

  afterEach(() => {
    reader.stopReading();
  });

  describe('Configuration', () => {
    it('should accept translation configuration', () => {
      const byteCodeMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        y: { byteIndex: [3, 4], min: 0, max: 9000 },
      };

      const readerWithTranslation = new MockHIDReader({
        reportId: 8,
        packetInterval: 5,
        translateEvents: true,
        byteCodeMappings,
      });

      expect(readerWithTranslation['config'].translateEvents).toBe(true);
      expect(readerWithTranslation['config'].byteCodeMappings).toBe(byteCodeMappings);

      readerWithTranslation.stopReading();
    });

    it('should work without translation configuration', () => {
      expect(reader['config'].translateEvents).toBeUndefined();
      expect(reader['config'].byteCodeMappings).toBeUndefined();
    });

    it('should accept various report IDs', () => {
      const reportIds = [1, 8, 16, 32];

      reportIds.forEach(reportId => {
        const testReader = new MockHIDReader({
          reportId,
          packetInterval: 5,
        });

        expect(testReader['config'].reportId).toBe(reportId);
        testReader.stopReading();
      });
    });

    it('should accept various packet intervals', () => {
      const intervals = [1, 5, 10, 16];

      intervals.forEach(interval => {
        const testReader = new MockHIDReader({
          reportId: 8,
          packetInterval: interval,
        });

        expect(testReader['config'].packetInterval).toBe(interval);
        testReader.stopReading();
      });
    });
  });

  describe('Data Reading', () => {
    it('should read data from generator', (done) => {
      let dataCount = 0;

      reader.startReading((data, reportId) => {
        expect(data).toBeInstanceOf(Uint8Array);
        expect(data.length).toBeGreaterThan(0);
        expect(reportId).toBe(8);
        dataCount++;

        if (dataCount >= 3) {
          reader.stopReading();
          done();
        }
      });

      reader.play(generator.generateCircle(0.5, 0.5, 0.3, 1000));
    });

    it('should emit correct report ID', () => {
      return new Promise<void>((resolve) => {
        const customReportId = 16;
        const customReader = new MockHIDReader({
          reportId: customReportId,
          packetInterval: 5,
        });

        customReader.startReading((data, reportId) => {
          expect(reportId).toBe(customReportId);
          customReader.stopReading();
          resolve();
        });

        customReader.play(generator.generateCircle(0.5, 0.5, 0.3, 1000));
      });
    });

    it('should handle multiple play calls', async () => {
      let dataCount = 0;

      reader.startReading((data) => {
        expect(data).toBeInstanceOf(Uint8Array);
        dataCount++;
      });

      await reader.play(generator.generateCircle(0.5, 0.5, 0.3, 500));
      const firstCount = dataCount;
      expect(firstCount).toBeGreaterThan(0);

      dataCount = 0;
      await reader.play(generator.generateLine(0.2, 0.2, 0.8, 0.8, 500));
      expect(dataCount).toBeGreaterThan(0);

      reader.stopReading();
    });
  });

  describe('Playback Control', () => {
    it('should stop playback when requested', (done) => {
      let dataCount = 0;

      reader.startReading(() => {
        dataCount++;

        if (dataCount === 3) {
          reader.stop();
          const countAtStop = dataCount;

          setTimeout(() => {
            expect(dataCount).toBe(countAtStop);
            done();
          }, 50);
        }
      });

      reader.play(generator.generateCircle(0.5, 0.5, 0.3, 1000));
    });

    it('should handle stop before play', () => {
      expect(() => {
        reader.stop();
      }).not.toThrow();
    });
  });
});