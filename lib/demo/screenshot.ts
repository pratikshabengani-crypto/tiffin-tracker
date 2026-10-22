// "21 Oct 2026, 9:12 pm" for the receipt's date line.
export function receiptTime(instant: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    .format(new Date(instant))
    .toLowerCase();
}

// Draws a clearly-labelled SAMPLE payment receipt for the demo (never a real app's design).
export function sampleScreenshot(amount: number, utr: string, when: string, paidTo = "Annapoorna Tiffins"): string {
  const rupees = new Intl.NumberFormat("en-IN").format(amount);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
<rect width="360" height="640" fill="#f4f6f8"/>
<rect x="0" y="0" width="360" height="56" fill="#2f4858"/>
<text x="20" y="35" font-family="Arial" font-size="18" fill="#fff">UPI payment</text>
<circle cx="180" cy="150" r="42" fill="#1f9d55"/>
<path d="M160 150 l14 14 l28 -30" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="180" y="230" font-family="Arial" font-size="20" fill="#1f9d55" text-anchor="middle">Payment successful</text>
<text x="180" y="290" font-family="Arial" font-size="44" font-weight="bold" fill="#111" text-anchor="middle">&#8377;${rupees}</text>
<text x="30" y="360" font-family="Arial" font-size="14" fill="#666">Paid to</text>
<text x="30" y="384" font-family="Arial" font-size="18" fill="#111">${paidTo}</text>
<text x="30" y="430" font-family="Arial" font-size="14" fill="#666">UPI transaction ID</text>
<text x="30" y="454" font-family="Arial" font-size="18" fill="#111">${utr}</text>
<text x="30" y="500" font-family="Arial" font-size="14" fill="#666">Date</text>
<text x="30" y="524" font-family="Arial" font-size="18" fill="#111">${when}</text>
<rect x="20" y="570" width="320" height="40" rx="6" fill="#fde68a"/>
<text x="180" y="596" font-family="Arial" font-size="15" font-weight="bold" fill="#92400e" text-anchor="middle">SAMPLE · for demo only</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
