import { getScenario } from '@/lib/scenarios';
export function ScenarioGuide({ scenarioId }: { scenarioId: string }) {
  const scenario = getScenario(scenarioId);
  if (!scenario) return null;
  return <section className="scenario-guide" aria-label="本次表达框架"><h3>{scenario.title}</h3><ol>{scenario.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="small muted">{scenario.tip}</p><details><summary>看一个例子</summary><p>{scenario.example}</p></details></section>;
}
