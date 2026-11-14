const number = new Intl.NumberFormat("en", {maximumFractionDigits:1});
export const missionHours = (pct, days) => Number.isFinite(pct) && Number.isFinite(days) ? pct * days * 24 / 100 : null;
export function timeAmount(hours) {
  return hours < 1 ? `${number.format(hours*60)} min` : `${number.format(hours)} h`;
}
export function comparisonTakeaway(rows) {
  const ready = rows.filter(row => row.metrics && !row.error);
  if (ready.length < 2) return rows.length < 2 ? "Add another plan to see which gives you more sunlight or Earth visibility." : "Calculating the trade-off. The comparison will appear when both plans have complete data.";
  if(ready.length<rows.length)return "Waiting for the remaining plans. Retry any plan whose data could not load.";
  const sentence = (key, description) => {
    const ranked=ready.map(row=>({...row,hours:missionHours(row.metrics[key],row.durationDays)})).sort((a,b)=>b.hours-a.hours);
    if(ranked.some(row=>row.hours===null))return null;
    const [first,second]=ranked, last=ranked.at(-1);
    if(Math.abs(first.hours-last.hours)<1/60)return `The plans offer about the same ${description}.`;
    if(Math.abs(first.hours-second.hours)<1/60)return `${first.label??`Plan ${first.id}`} and ${second.label??`plan ${second.id}`} tie for the most ${description}.`;
    return `${first.label??`Plan ${first.id}`} gives ${timeAmount(first.hours-second.hours)} more ${description} than ${second.label??`plan ${second.id}`}.`;
  };
  const text = [sentence("sunlitPct","sunlight"),sentence("earthVisiblePct","Earth visibility")].filter(Boolean).join(" ");
  return text + (new Set(ready.map(row=>row.durationDays)).size>1 ? " These totals cover different lengths of stay." : "");
}
