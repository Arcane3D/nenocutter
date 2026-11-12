import type { BuildResult, CutterSettings } from '../domain/types';

export type IssueLevel = 'info' | 'warn' | 'block';

export interface PrintIssue {
  level: IssueLevel;
  message: string;
}

export interface PrintReport {
  level: IssueLevel;
  issues: PrintIssue[];
}

export function assessPrint(settings: CutterSettings, result: BuildResult | null): PrintReport {
  const issues: PrintIssue[] = [];
  if (!result || result.status === 'error' || result.parts.length === 0) {
    issues.push({
      level: 'block',
      message: result?.errors[0] ?? 'There is no mesh to export yet.',
    });
  }
  for (const error of result?.errors ?? []) {
    if (!issues.some((issue) => issue.message === error)) issues.push({ level: 'block', message: error });
  }
  if (settings.wallThickness < settings.minimumWall - 1e-6) {
    issues.push({
      level: 'block',
      message: `Blade thickness ${settings.wallThickness.toFixed(2)} mm is under the ${settings.minimumWall.toFixed(2)} mm minimum wall. Raise the thickness or lower the minimum before printing.`,
    });
  } else if (settings.wallThickness < 0.8) {
    issues.push({
      level: 'warn',
      message: 'This wall is under 0.8 mm. It can print, but a 0.4 mm nozzle will be happier at 0.8 mm or more.',
    });
  }
  if (settings.sharpEdge && settings.tipWidth < 0.2) {
    issues.push({
      level: 'warn',
      message: 'The cutting tip is very fine and may not survive the first press into dough.',
    });
  }
  if (settings.sharpEdge && settings.chamferHeight > 0.2) {
    const run = Math.max(0, settings.wallThickness - settings.tipWidth);
    const angle = (Math.atan2(run, settings.chamferHeight) * 180) / Math.PI;
    if (angle > 50) {
      issues.push({
        level: 'warn',
        message: `The chamfer overhangs about ${angle.toFixed(0)}° from vertical. Expect some droop on the tip unless you slow the top layers.`,
      });
    }
  }
  if (settings.imprintDepth > 0 && settings.imprintWidth < 0.4) {
    issues.push({
      level: 'warn',
      message: 'Imprint lines are narrower than 0.4 mm and may disappear on an FDM printer.',
    });
  }
  if (settings.bladeDepth > 28) {
    issues.push({
      level: 'warn',
      message: 'A blade this tall can wobble. Add a center bar or a wider base if the part rocks while cutting.',
    });
  }
  const width = result?.dimensions.width ?? 0;
  const height = result?.dimensions.height ?? 0;
  if (width > settings.bedSize + 0.5 || height > settings.bedSize + 0.5) {
    issues.push({
      level: 'block',
      message: `The part is ${width.toFixed(0)} × ${height.toFixed(0)} mm and does not fit the ${settings.bedSize.toFixed(0)} mm bed. Scale it down or pick a larger bed.`,
    });
  }
  if (result) {
    for (const warning of result.warnings) issues.push({ level: 'warn', message: warning });
  }
  const level: IssueLevel = issues.some((issue) => issue.level === 'block')
    ? 'block'
    : issues.some((issue) => issue.level === 'warn')
      ? 'warn'
      : 'info';
  return { level, issues };
}
