import SPELLS from 'common/SPELLS';

import Module from 'Parser/Core/Module';

const debug = false;

/** The amount of time (in ms) left on a refresh Atonement for it to be considered inefficient. */
const IMPROPER_REFRESH_TIME = 3000;

class Atonement extends Module {
  priority = 99;
  healing = 0;
  totalAtones = 0;
  totalAtonementRefreshes = 0;
  currentAtonementTargets = [];
  improperAtonementRefreshes = [];

  get atonementDuration() {
    const applicatorEvent = this.owner.modules.atonementSource.atonementApplicationSourceEvent;
    if (!applicatorEvent) {
      return 15;
    }
    const applicatorSpellId = applicatorEvent.ability.guid;
    let duration = this.owner.modules.atonementSource.atonementDuration.get(applicatorSpellId);

    if (applicatorSpellId === SPELLS.POWER_WORD_SHIELD.id && this.owner.selectedCombatant.hasBuff(SPELLS.DISC_PRIEST_T19_4SET_BONUS_BUFF.id, applicatorEvent.timestamp) && this.owner.selectedCombatant.hasBuff(SPELLS.RAPTURE.id, applicatorEvent.timestamp)) {
      duration += 6;
    }

    return duration;
  }

  get numAtonementsActive() {
    return this.currentAtonementTargets.length;
  }

  on_initialized() {
    this.active = true;
  }

  on_byPlayer_applybuff(event) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.ATONEMENT_BUFF.id) {
      return;
    }

    const atonement = {
      target: event.targetID,
      lastAtonementAppliedTimestamp: event.timestamp,
      atonementExpirationTimestamp: event.timestamp + this.atonementDuration * 1000,
    };

    this.currentAtonementTargets = this.currentAtonementTargets.filter(id => id.target !== atonement.target);
    this.currentAtonementTargets.push(atonement);
    this.totalAtones++;
    debug && console.log(`%c${this.owner.combatants.players[atonement.target].name} gained an atonement`, 'color:green', this.currentAtonementTargets);
    this.owner.triggerEvent('atonement_applied', event);
  }
  on_byPlayer_refreshbuff(event) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.ATONEMENT_BUFF.id) {
      return;
    }

    // Check if Atonement was refreshed too early
    let refreshedTarget = this.currentAtonementTargets.find(id => id.target === event.targetID);
    if (!refreshedTarget) {
      refreshedTarget = {
        target: event.targetID,
        lastAtonementAppliedTimestamp: this.owner.fight.start_time,
      };
      debug && console.warn('Atonement: was applied prior to combat');
    }
    const timeSinceApplication = event.timestamp - refreshedTarget.lastAtonementAppliedTimestamp;
    if (timeSinceApplication < ((this.atonementDuration * 1000) - IMPROPER_REFRESH_TIME)) {
      this.improperAtonementRefreshes.push(refreshedTarget);
      debug && console.log(`%c${this.owner.combatants.players[event.targetID].name} refreshed an atonement too early %c${timeSinceApplication}`, 'color:red', this.currentAtonementTargets);
      this.owner.triggerEvent('atonement_refresh_improper', event);
    }

    const atonement = {
      target: event.targetID,
      lastAtonementAppliedTimestamp: event.timestamp,
      // Refreshing an Atonement will never reduce its duration
      atonementExpirationTimestamp: Math.max(refreshedTarget.atonementExpirationTimestamp, event.timestamp + this.atonementDuration * 1000),
    };
    this.currentAtonementTargets = this.currentAtonementTargets.filter(item => item.target !== atonement.target);
    this.currentAtonementTargets.push(atonement);

    this.totalAtones++;
    this.totalAtonementRefreshes++;
    debug && console.log(`%c${this.owner.combatants.players[atonement.target].name} refreshed an atonement`, 'color:orange', this.currentAtonementTargets);
    this.owner.triggerEvent('atonement_refresh', event);
  }
  on_byPlayer_removebuff(event) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.ATONEMENT_BUFF.id) {
      return;
    }
    const atonement = {
      target: event.targetID,
      lastAtonementAppliedTimestamp: event.timestamp,
    };
    this.currentAtonementTargets = this.currentAtonementTargets.filter(id => id.target !== atonement.target);
    debug && console.log(`%c${this.owner.combatants.players[atonement.target].name} lost an atonement`, 'color:red', this.currentAtonementTargets);
    this.owner.triggerEvent('atonement_faded', event);
  }

  on_byPlayer_heal(event) {
    const spellId = event.ability.guid;
    if ([SPELLS.ATONEMENT_HEAL_NON_CRIT.id, SPELLS.ATONEMENT_HEAL_CRIT.id].indexOf(spellId) === -1) {
      return;
    }

    event = Object.assign(event, { isAtonementHeal: true });

    debug && console.log('Atonement:', event.amount + (event.absorbed || 0), 'healing done to', event.targetID);
    this.healing += event.amount + (event.absorbed || 0);
  }
}

export default Atonement;
