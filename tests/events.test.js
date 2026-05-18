const { publish, subscribe } = require('../src/events');

describe('events bus', () => {
  test('subscribers receive events for their invitation', (done) => {
    const unsubscribe = subscribe(42, (event) => {
      expect(event.kind).toBe('rsvp');
      expect(event.payload.guest_name).toBe('Tester');
      expect(event.at).toBeDefined();
      unsubscribe();
      done();
    });
    publish(42, 'rsvp', { guest_name: 'Tester' });
  });

  test('subscribers do not receive events for other invitations', (done) => {
    let received = false;
    const unsubscribe = subscribe(7, () => { received = true; });
    publish(99, 'wish', { guest_name: 'Other' });
    setTimeout(() => {
      expect(received).toBe(false);
      unsubscribe();
      done();
    }, 30);
  });

  test('unsubscribe stops further events', (done) => {
    let count = 0;
    const unsubscribe = subscribe(1, () => { count++; });
    publish(1, 'a', {});
    unsubscribe();
    publish(1, 'a', {});
    setTimeout(() => {
      expect(count).toBe(1);
      done();
    }, 30);
  });

  test('publish with null invitationId is a no-op', () => {
    expect(() => publish(null, 'x', {})).not.toThrow();
  });
});
