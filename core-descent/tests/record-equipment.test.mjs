import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProfile} from '../src/core.mjs';
import {makeEquipment,equipItem,consumeItem} from '../src/items.mjs';
import {CHALLENGE_SEED,captureLoadout,captureEquipment,makeRecord,addRecord,restoreRecords} from '../src/rankings.mjs';

test('挑戦記録は出発時の装備個体値と携行在庫を保持し、追加欄のない呼出しとも互換',()=>{
 const profile=makeProfile();
 const armor=makeEquipment('worn','drakescale_armor',{rarity:'epic',rolls:{maxHp:9500,armorMitigation:10500,damageBonus:10123}});
 profile.equipment.push(armor,makeEquipment('spare','traveler_vest'));equipItem(profile,'worn');
 const context={id:'equipment-snapshot',mode:'depth',source:'normal',depth:3,loadout:captureLoadout(profile),equipment:captureEquipment(profile),supplies:{...profile.consumables},createdAt:'2026-11-19T00:00:00.000Z'};
 const expectedEquipment=structuredClone(context.equipment),expectedSupplies={...context.supplies};
 assert.deepEqual(Object.keys(context.equipment).sort(),['armor','boots','charm']);assert.equal(context.equipment.charm,null);assert.equal(context.equipment.armor.id,'worn');
 // Owned supplies change during the attempt; its initial conditions must not change with them.
 consumeItem(profile,'healing_draught');profile.equipment[0].rolls.maxHp=10000;profile.equipped.armor=null;
 const engine={status:'dead',seed:CHALLENGE_SEED,clearedFloor:2,clearTime:55,totalTime:61,totalDamage:123.4567,damageBySource:{direct:100,poison:23.4567}};
 const record=makeRecord(engine,context);
 assert.deepEqual(record.equipment,expectedEquipment);assert.deepEqual(record.supplies,expectedSupplies);assert.equal(record.supplies.healing_draught,3);assert.equal(profile.consumables.healing_draught,2);
 // Finalization and local insertion each take their own snapshot, including nested rolls.
 context.equipment.armor.rolls.maxHp=10500;context.supplies.healing_draught=0;
 assert.deepEqual(record.equipment,expectedEquipment);assert.deepEqual(record.supplies,expectedSupplies);
 const stored=addRecord([],record);record.equipment.armor.rolls.maxHp=10000;record.supplies.healing_draught=0;
 assert.deepEqual(stored[0].equipment,expectedEquipment);assert.deepEqual(stored[0].supplies,expectedSupplies);
 const {equipment,supplies,...oldContext}=context;
 const compatible=makeRecord(engine,{...oldContext,id:'without-extra-fields'});
 assert.deepEqual(compatible.equipment,{});assert.deepEqual(compatible.supplies,{});
 delete compatible.equipment;delete compatible.supplies;
 assert.equal(restoreRecords([compatible]).length,1);
});
