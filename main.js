import { world, system, BlockPermutation } from "@minecraft/server";

// --- グローバル設定 ---
const LOG_PREFIX = "[一括破壊] ";
const REQUIRED_TOOL = "axe";
const TARGET_BLOCKS = ["log", "leaves"];
const MAX_BLOCKS_TO_DESTROY = 128;
const ENABLED_TAG = "veinminer_enabled";

// --- 切り替えトリガー ---
world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (!itemStack?.typeId.includes(REQUIRED_TOOL)) return;
    handleToggle(player);
});
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, itemStack } = event;
    if (!itemStack || !itemStack.typeId.includes(REQUIRED_TOOL)) return;
    handleToggle(player);
});

function handleToggle(player) {
    if (!player.isSneaking) return;
    if (player.hasTag(ENABLED_TAG)) {
        player.removeTag(ENABLED_TAG);
        player.sendMessage(`§a一括破壊機能が §eオフ §aになりました。`);
        console.log(`[Toggle] ${player.name} の一括破壊をオフにしました。`);
    } else {
        player.addTag(ENABLED_TAG);
        player.sendMessage(`§a一括破壊機能が §eオン §aになりました。`);
        console.log(`[Toggle] ${player.name} の一括破壊をオンにしました。`);
    }
}

// --- ブロック破壊時の処理 ---
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, brokenBlockPermutation, block } = event;
    if (!player.hasTag(ENABLED_TAG)) return;
    if (player.isSneaking) return;
    const isTarget = TARGET_BLOCKS.some(target => brokenBlockPermutation.type.id.includes(target));
    if (!isTarget) return;

    system.run(() => {
        let typesToDestroy = [];
        if (brokenBlockPermutation.type.id.includes("log")) {
            typesToDestroy = ["log", "leaves"];
        } else if (brokenBlockPermutation.type.id.includes("leaves")) {
            typesToDestroy = ["leaves"];
        }
        // ★★★ 修正点①: destroyConnectedBlocks に player を渡す ★★★
        destroyConnectedBlocks(block, typesToDestroy, player);
    });
});

/**
 * 繋がっている対象ブロックを再帰的に破壊する関数
 */
function destroyConnectedBlocks(startBlock, targetTypes, player) { // ★★★ 修正点②: player を受け取る ★★★
    const dimension = startBlock.dimension;
    const playerY = Math.floor(player.location.y); // プレイヤーの足元のY座標を取得

    // ★★★ 修正点③: 最初に壊したブロックが足元より下なら、連鎖させない ★★★
    if (startBlock.location.y < playerY) {
        console.log(LOG_PREFIX + "足元より下のブロックのため、連鎖破壊を中止しました。");
        // この場合、プレイヤーが壊した1ブロックだけが普通に壊れる
        return; 
    }

    const scannedLocations = new Set();
    scannedLocations.add(vectorToString(startBlock.location));
    
    const blocksToScan = [startBlock]; 
    const blocksToDestroy = [startBlock];
    let count = 1;

    const directions = [
        { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];

    while (blocksToScan.length > 0) {
        const currentBlock = blocksToScan.shift();
        
        for (const dir of directions) {
            const neighborLocation = {
                x: currentBlock.location.x + dir.x,
                y: currentBlock.location.y + dir.y,
                z: currentBlock.location.z + dir.z
            };

            if (scannedLocations.has(vectorToString(neighborLocation))) continue;
            scannedLocations.add(vectorToString(neighborLocation));

            // ★★★ 修正点④: 足元より下のブロックは探索対象外にする ★★★
            if (neighborLocation.y < playerY) {
                continue;
            }

            const neighborBlock = dimension.getBlock(neighborLocation);

            if (neighborBlock) {
                const isNeighborTarget = targetTypes.some(type => neighborBlock.typeId.includes(type));
                if (isNeighborTarget) {
                    if (count >= MAX_BLOCKS_TO_DESTROY) break;
                    blocksToScan.push(neighborBlock);
                    blocksToDestroy.push(neighborBlock);
                    count++;
                }
            }
        }
        if (count >= MAX_BLOCKS_TO_DESTROY) break;
    }

    for (const block of blocksToDestroy) {
        dimension.runCommand(`setblock ${vectorToString(block.location)} air destroy`);
    }

    console.log(LOG_PREFIX + `${count} 個のブロックを破壊しました。`);
}

function vectorToString(vector) { return `${Math.floor(vector.x)} ${Math.floor(vector.y)} ${Math.floor(vector.z)}`; }