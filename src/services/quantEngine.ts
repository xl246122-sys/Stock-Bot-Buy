// Legacy strategy compatibility layer. Production decisions belong exclusively to server AI.
import { QuantSignal } from '../types/stock';
export class QuantEngine {
  public static evaluateStock(..._args: any[]): QuantSignal | null { return null; }
  public static checkPlungeDipModel(..._args: any[]): QuantSignal | null { return null; }
  public static checkOpeningBreakoutModel(..._args: any[]): QuantSignal | null { return null; }
  public static checkRangeOscillatorModel(..._args: any[]): QuantSignal | null { return null; }
  public static checkDipExhaustionModel(..._args: any[]): QuantSignal | null { return null; }
  public static checkDipStartedModel(..._args: any[]): QuantSignal | null { return null; }
  public static evaluatePositionOverbought(..._args: any[]): QuantSignal | null { return null; }
  public static checkBreakdownModel(..._args: any[]): QuantSignal | null { return null; }
  public static generateNaturalAnalysis(..._args:any[]): string { return ''; }
  public static createBreakdownSignal(..._args:any[]): QuantSignal { throw new Error('本地策略已停用，请查看服务器AI研判'); }
}
