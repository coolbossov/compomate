import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dir = new URL('../.github/workflows/', import.meta.url);
test('all six jobs have fixed optional labels and hosted fallback', () => {
  let count = 0;
  for (const file of ['ci.yml', 'changelog-enforce.yml', 'infra-doc-advisory.yml', 'post-deploy.yml']) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const line of text.split('\n').filter(l => l.includes('runs-on:'))) {
      count++;
      assert.match(line, /ovh-compomate-ci-ephemeral/);
      assert.match(line, /ubuntu-latest/);
      assert.doesNotMatch(line, /runs-on: \$\{\{ vars\.[^ ]+ \}\}/);
    }
  }
  assert.equal(count, 6);
});
test('manual canary is main-only and E2E admission is separate', () => {
  const text = readFileSync(new URL('ci.yml', dir), 'utf8');
  assert.match(text, /github.ref == 'refs\/heads\/main' && inputs.runner_target == 'ovh'/);
  assert.match(text, /github.event_name != 'workflow_dispatch'/);
  assert.match(text, /OVH_COMPOMATE_E2E_RUNNER_LABEL/);
  assert.match(text, /if: always\(\) && github.event_name == 'pull_request'/);
});

test('actual CI expressions select the intended fixed runner for 384 contexts', () => {
  const source = readFileSync(new URL('ci.yml', dir), 'utf8');
  const expressions = source.split('\n').filter(line => line.includes('runs-on:'))
    .map(line => line.slice(line.indexOf('${{') + 3, line.lastIndexOf('}}')).trim());
  const label = 'ovh-compomate-ci-ephemeral';
  let checked = 0;
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/main', 'refs/heads/feature']) {
      for (const target of ['', 'hosted', 'ovh', 'unexpected']) {
        for (const ciLabel of ['', label, 'self-hosted', 'unexpected']) {
          for (const e2eLabel of ['', label, 'self-hosted', 'unexpected']) {
            const github = { event_name: event, ref };
            const inputs = { runner_target: target };
            const vars = { OVH_COMPOMATE_CI_RUNNER_LABEL: ciLabel, OVH_COMPOMATE_E2E_RUNNER_LABEL: e2eLabel };
            // These inspected expressions use only literals, context properties,
            // equality and &&/||; their string truthiness matches GitHub here.
            const actual = expressions.map(expression => Function('github', 'inputs', 'vars', `return (${expression});`)(github, inputs, vars));
            const canary = event === 'workflow_dispatch' && ref === 'refs/heads/main' && target === 'ovh';
            const normal = event !== 'workflow_dispatch' && ciLabel === label;
            assert.deepEqual(actual, [canary || normal ? label : 'ubuntu-latest', e2eLabel === label ? label : 'ubuntu-latest', ciLabel === label ? label : 'ubuntu-latest']);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 384);
});

test('PR-only E2E/merge and independent production verification admission stay intact', () => {
  const ci = readFileSync(new URL('ci.yml', dir), 'utf8');
  assert.match(ci, /e2e:\n    if: github.event_name == 'pull_request' && github.actor != 'dependabot\[bot\]'/);
  assert.match(ci, /auto-merge:[\s\S]*if: always\(\) && github.event_name == 'pull_request'/);
  const verify = readFileSync(new URL('post-deploy.yml', dir), 'utf8');
  assert.match(verify, /OVH_COMPOMATE_VERIFY_RUNNER_LABEL/);
  assert.doesNotMatch(verify, /OVH_COMPOMATE_CI_RUNNER_LABEL|workflow_dispatch/);
});
