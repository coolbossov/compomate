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
      assert.match(line, /fromJSON\(/);
      assert.match(line, /\["self-hosted","Linux","X64","ovh-compomate-ci-ephemeral"\]/);
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

test('actual CI expressions select the intended fixed runner for 576 contexts', () => {
  const source = readFileSync(new URL('ci.yml', dir), 'utf8');
  const expressions = source.split('\n').filter(line => line.includes('runs-on:'))
    .map(line => line.slice(line.indexOf('${{') + 3, line.lastIndexOf('}}')).trim());
  const label = 'ovh-compomate-ci-ephemeral';
  let checked = 0;
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const branch of ['main', 'feature', 'dependabot/npm_and_yarn/next-16.3.0']) {
      for (const target of ['', 'hosted', 'ovh', 'unexpected']) {
        for (const ciLabel of ['', label, 'self-hosted', 'unexpected']) {
          for (const e2eLabel of ['', label, 'self-hosted', 'unexpected']) {
            const ref = `refs/heads/${branch}`;
            // Pull requests expose the branch as head_ref (ref_name is "<pr>/merge"); other events only as ref_name.
            const github = event === 'pull_request'
              ? { event_name: event, ref, head_ref: branch, ref_name: '41/merge' }
              : { event_name: event, ref, head_ref: '', ref_name: branch };
            const inputs = { runner_target: target };
            const vars = { OVH_COMPOMATE_CI_RUNNER_LABEL: ciLabel, OVH_COMPOMATE_E2E_RUNNER_LABEL: e2eLabel };
            // These inspected expressions use only literals, context properties,
            // equality, &&/||, startsWith and fromJSON; use JSON.parse for the actual
            // label array and GitHub's case-insensitive startsWith.
            const startsWith = (value, prefix) => String(value ?? '').toLowerCase().startsWith(String(prefix ?? '').toLowerCase());
            const actual = expressions.map(expression => Function('github', 'inputs', 'vars', 'fromJSON', 'startsWith', `return (${expression});`)(github, inputs, vars, JSON.parse, startsWith));
            const canary = event === 'workflow_dispatch' && ref === 'refs/heads/main' && target === 'ovh';
            const normal = event !== 'workflow_dispatch' && ciLabel === label;
            const selected = ['self-hosted', 'Linux', 'X64', label];
            const hosted = ['ubuntu-latest'];
            const dependabot = branch.startsWith('dependabot/');
            const dependabotHosted = ['ubuntu-24.04'];
            const expected = dependabot
              ? [dependabotHosted, dependabotHosted, dependabotHosted]
              : [canary || normal ? selected : hosted, e2eLabel === label ? selected : hosted, ciLabel === label ? selected : hosted];
            assert.deepEqual(actual, expected);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 576);
});

test('PR-only E2E/merge and independent production verification admission stay intact', () => {
  const ci = readFileSync(new URL('ci.yml', dir), 'utf8');
  assert.match(ci, /e2e:\n    if: github.event_name == 'pull_request' && github.actor != 'dependabot\[bot\]'/);
  assert.match(ci, /auto-merge:[\s\S]*if: always\(\) && github.event_name == 'pull_request'/);
  const verify = readFileSync(new URL('post-deploy.yml', dir), 'utf8');
  assert.match(verify, /OVH_COMPOMATE_VERIFY_RUNNER_LABEL/);
  assert.doesNotMatch(verify, /OVH_COMPOMATE_CI_RUNNER_LABEL|workflow_dispatch/);
});
