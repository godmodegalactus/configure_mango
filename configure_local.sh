#!/usr/bin/env bash
#
# Run a minimal Solana cluster.  Ctrl-C to exit.
#
# Before running this script ensure standard Solana programs are available
# in the PATH, or that `cargo build` ran successfully
#
# Prefer possible `cargo build` binaries over PATH binaries

# ctrl-c trap to stop child processes
trap ctrl_c INT
function ctrl_c() {
    echo "Kill them all"
    pkill -P $$
    exit 1
}

export RUST_LOG=${RUST_LOG:-solana=info,solana_runtime::message_processor=debug} # if RUST_LOG is unset, default to info
export RUST_BACKTRACE=1
dataDir=$PWD/config
ledgerDir=$PWD/config/ledger

SOLANA_RUN_SH_CLUSTER_TYPE=${SOLANA_RUN_SH_CLUSTER_TYPE:-development}

set -x
if ! solana address; then
  echo Generating default keypair
  solana-keygen new --no-passphrase
fi
validator_identity="$dataDir/validator-identity.json"
if [[ -e $validator_identity ]]; then
  echo "Use existing validator keypair"
else
  solana-keygen new --no-passphrase -so "$validator_identity"
fi
validator_vote_account="$dataDir/validator-vote-account.json"
if [[ -e $validator_vote_account ]]; then
  echo "Use existing validator vote account keypair"
else
  solana-keygen new --no-passphrase -so "$validator_vote_account"
fi
validator_stake_account="$dataDir/validator-stake-account.json"
if [[ -e $validator_stake_account ]]; then
  echo "Use existing validator stake account keypair"
else
  solana-keygen new --no-passphrase -so "$validator_stake_account"
fi

if [[ -e "$ledgerDir"/genesis.bin || -e "$ledgerDir"/genesis.tar.bz2 ]]; then
  echo "Use existing genesis"
else
  if [[ -r spl-genesis-args.sh ]]; then
    SPL_GENESIS_ARGS=$(cat spl-genesis-args.sh)
  fi

  echo $SPL_GENESIS_ARGS
  # shellcheck disable=SC2086
  solana-genesis \
    --hashes-per-tick sleep \
    --faucet-lamports 500000000000000000 \
    --bootstrap-validator \
      "$validator_identity" \
      "$validator_vote_account" \
      "$validator_stake_account" \
    --ledger "$ledgerDir" \
    --cluster-type "mainnet-beta" \
    $SPL_GENESIS_ARGS \
    $SOLANA_RUN_SH_GENESIS_ARGS
fi

solana-faucet &
faucet=$!

args=(
  --identity "$validator_identity"
  --vote-account "$validator_vote_account"
  --ledger "$ledgerDir"
  --gossip-port 8001
  --full-rpc-api
  --rpc-port 8899
  --rpc-faucet-address 127.0.0.1:9900
  --log "$dataDir/validator.log"
  --enable-rpc-transaction-history
  --enable-extended-tx-metadata-storage
  --init-complete-file "$dataDir"/init-completed
  --snapshot-compression none
  --require-tower
  --no-wait-for-vote-to-start-leader
  --no-os-network-limits-test
)
# shellcheck disable=SC2086
solana-validator "${args[@]}" $SOLANA_RUN_SH_VALIDATOR_ARGS &
validator=$!

wait "$validator"
