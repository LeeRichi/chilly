/** Keep routine lookups fast while sending legal, comparative, and constraint-heavy tasks to Exa Deep. */
export function isComplexResearch(queries: string[]): boolean {
  if (queries.length > 1) return true;

  const text = queries.join(" ").toLowerCase();
  const specialized =
    /\b(legal|law|rights?|regulation|eligib\w*|benefits?|allowance|subsid\w*|grant|visa|residen\w* permit|tenant|landlord|rent\w*|tax|insurance|compare|comparison|versus|vs\.?|best|cheapest|options?)\b|福利|補助|資格|申請|租屋|租金|租賃|房東|法律|合法|規定|簽證|居留|稅務|保險|比較|哪個|最便宜/.test(
      text,
    );
  if (specialized) return true;

  const conditions =
    text.match(
      /\b(and|while|before|after|under|over|by|between|within|first|then|also|but|with)\b|[,，;；]/g,
    ) ?? [];
  const multiStopPlan =
    /\b(plan|schedule|itinerary)\b/.test(text) &&
    /\b(day|trip|travel|flight|journey|rental car)\b/.test(text);
  const fixedTime = /\b\d{1,2}[:.]\d{2}\b|\b(until|deadline|leaves? at|arrives? at)\b/.test(text);
  return (
    multiStopPlan ||
    (fixedTime && conditions.length >= 1) ||
    conditions.length >= 2 ||
    (text.length > 180 && conditions.length >= 1)
  );
}
