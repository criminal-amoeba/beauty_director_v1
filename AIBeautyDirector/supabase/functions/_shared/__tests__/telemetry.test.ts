/** @jest-environment node */
import { resetTally, tally, tallyLine } from '../telemetry';

describe('tally', () => {
  beforeEach(resetTally);

  it('counts outcomes and safety hits per term in one log-friendly line', () => {
    tally('ok'); tally('ok'); tally('ok');
    tally('fallback');
    tally('length');
    tally('safety', 'en_treat');
    tally('safety', 'zh_doctor');
    tally('safety', 'en_treat');
    expect(tallyLine()).toBe('ok=3 fallback=1 empty=0 length=1 provider=0 safety=en_treat:2,zh_doctor:1');
  });

  it('starts empty and resets', () => {
    expect(tallyLine()).toBe('ok=0 fallback=0 empty=0 length=0 provider=0 safety=');
    tally('empty');
    resetTally();
    expect(tallyLine()).toBe('ok=0 fallback=0 empty=0 length=0 provider=0 safety=');
  });
});
