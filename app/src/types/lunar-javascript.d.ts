// lunar-javascript 没有自带类型声明，这里只声明我们用到的最小子集
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): Lunar;
    toYmd(): string;
  }

  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar;
    getSolar(): Solar;
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    toString(): string;
  }
}
