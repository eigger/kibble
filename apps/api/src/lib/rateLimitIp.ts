/** rate limit 키용 IP — IPv6는 앞 4그룹(/64)만 쓴다. IPv4(및 IPv4-mapped)는 그대로. */
export function rateLimitIp(ip: string): string {
  if (!ip.includes(":") || ip.toLowerCase().startsWith("::ffff:")) return ip;
  const [head = ""] = ip.split("%");
  const [left = "", right] = head.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const fill = right === undefined ? 0 : 8 - leftGroups.length - rightGroups.length;
  const groups = [...leftGroups, ...Array<string>(Math.max(fill, 0)).fill("0"), ...rightGroups];
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
