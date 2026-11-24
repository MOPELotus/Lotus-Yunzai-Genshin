import { miaoTemplateFont } from "../../../lib/game-template-fonts.ts";
import { renderGenshinCardForChat } from "../card-render.ts";
import { readPanelTheme } from "./theme.ts";

const help = /^#(?:原神)?(?:角色|换|更换)?面[板版]帮助$/u;
const width = 797, height = 1050;
const font = miaoTemplateFont();

const sections = [
  { y: 160, title: "#更新面板、#展板更新面板",
    lines: ["使用米游社刷新当前档案的面板。", "公开展板使用游戏内展柜。", "在游戏中开启「显示角色详情」。"], size: 22, available: 434 },
  { y: 312, title: "#面板",
    lines: ["查看当前档案已保存的角色面板。"], size: 24 },
  { y: 430, title: "#胡桃面板、#胡桃伤害、#圣遗物列表",
    lines: ["查看指定角色的面板和伤害计算。", "圣遗物列表按评分展示已保存的圣遗物。"], size: 24 },
  { y: 599, title: "#心海排行、#心海圣遗物排行",
    lines: ["在已启用排名的群聊中查询当前群排行。", "在本群查看自己的角色面板后可参与排行。"], size: 24 },
  { y: 770, title: "面板计算命令示例",
    lines: ["#胡桃面板换钟离武器", "#胡桃换90级精1灭辰", "#胡桃换95级换天赋91312",
      "#胡桃伤害2换90级精1灭辰", "#胡桃换精1灭辰换神里绫华杯+头"], size: 19 },
] as const;
const note = "换装用于临时试算，使用当前档案装备或可用的公开预设。";

export function matchGenshinPanelHelp(message: string) {
  return help.test(message.trim().replace(/^＃/u, "#"));
}

export async function renderGenshinPanelHelp({
  signal, inlineImageByteLimit, theme = readPanelTheme, mode = "auto",
}: { readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number; readonly theme?: typeof readPanelTheme;
  readonly mode?: Parameters<typeof renderGenshinCardForChat>[3] } = {}) {
  if (signal?.aborted) return;
  const asset = await theme().then(value => value.picture("character", "imgs", "help.jpg")).catch(() => undefined);
  if (signal?.aborted) return;
  if (asset?.width === width && asset.height === height) {
    try {
      const { png } = await renderGenshinCardForChat(width, height, ctx => {
        ctx.drawImage(asset, 0, 0);
        // Keep the original frame and headline while replacing the obsolete instruction raster.
        ctx.fillStyle = "#f0ece3";
        ctx.fillRect(26, 115, 746, 892);
        for (const y of [126, 293, 397, 563, 740]) {
          ctx.drawImage(asset, 26, 126, 746, 21, 26, y, 746, 21);
        }
        // This part of the old in-game showcase illustration has no overlapping captions.
        ctx.drawImage(asset, 484, 292, 285, 119, 480, 171, 285, 119);
        ctx.textBaseline = "top";
        sections.forEach(section => {
          ctx.fillStyle = "#bb843e";
          ctx.font = `bold 27px ${font}`;
          ctx.fillText(section.title, 40, section.y - 10, 712);
          ctx.fillStyle = "#75665a";
          ctx.font = `600 ${section.size}px ${font}`;
          section.lines.forEach((line, i) => ctx.fillText(line, 40,
            section.y + (section.size === 19 ? 45 + 31 * i : 39 + 34 * i),
            "available" in section ? section.available : 712));
        });
        ctx.fillStyle = "#b51b29"; ctx.font = `600 19px ${font}`;
        ctx.fillText(note, 40, 977, 712);
      }, mode, { signal, inlineImageByteLimit });
      if (!signal?.aborted) return { type: "image", file: png } as const;
    } catch {
      if (signal?.aborted) return;
    }
  }
  return ["角色面板帮助", ...sections.flatMap(({ title, lines }) => [title, ...lines]), note].join("\n");
}
