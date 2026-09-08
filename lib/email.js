import { Resend } from "resend";
import { fmt } from "./analysis";

export async function sendAlertEmail(to, alerts) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping alert email");
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const rows = alerts
    .map(({ symbol, analysis, reasons }) => {
      const s = analysis.primary;
      const dirWord = s.direction === "long" ? "Long" : "Short";
      return `
      <tr>
        <td style="padding:8px 12px;font-weight:600;">${symbol}</td>
        <td style="padding:8px 12px;">${dirWord}</td>
        <td style="padding:8px 12px;">Grade ${s.grade}</td>
        <td style="padding:8px 12px;font-family:monospace;">${fmt(s.entry)}</td>
        <td style="padding:8px 12px;font-family:monospace;">${fmt(s.stop)}</td>
        <td style="padding:8px 12px;font-family:monospace;">${fmt(s.target)}</td>
        <td style="padding:8px 12px;color:#666;font-size:12px;">${reasons.join(", ")}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:640px;">
      <h2 style="margin-bottom:4px;">Basecamp — ${alerts.length} setup${alerts.length > 1 ? "s" : ""} changed</h2>
      <p style="color:#666;font-size:13px;margin-top:0;">You're getting this because a primary setup newly graded A, or a base broke out, on today's check.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="text-align:left;border-bottom:2px solid #ddd;">
            <th style="padding:8px 12px;">Pair</th>
            <th style="padding:8px 12px;">Direction</th>
            <th style="padding:8px 12px;">Grade</th>
            <th style="padding:8px 12px;">Entry</th>
            <th style="padding:8px 12px;">Stop</th>
            <th style="padding:8px 12px;">Take profit</th>
            <th style="padding:8px 12px;">Why</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#999;font-size:12px;margin-top:20px;">This is analysis, not advice. Open Basecamp to see the full chart and secondary setup before deciding anything.</p>
    </div>
  `;

  await resend.emails.send({
    from: process.env.RESEND_FROM || "Basecamp <onboarding@resend.dev>",
    to,
    subject: `Basecamp: ${alerts.length} setup${alerts.length > 1 ? "s" : ""} changed`,
    html,
  });
}
