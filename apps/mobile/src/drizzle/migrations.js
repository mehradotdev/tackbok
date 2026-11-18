// Required for Expo/React Native SQLite migrations.
// https://orm.drizzle.team/docs/connect-expo-sqlite

import journal from './meta/_journal.json';
import m0000 from './0000_public_scrambler.sql';
import m0001 from './0001_clammy_winter_soldier.sql';
import m0002 from './0002_marvelous_avengers.sql';
import m0003 from './0003_common_silhouette.sql';
import m0004 from './0004_colorful_xavin.sql';
import m0005 from './0005_profile_pristine_marker.sql';
import m0006 from './0006_blushing_goblin_queen.sql';
import m0007 from './0007_media_hash_cache.sql';
import m0008 from './0008_sync_v2_local_schema.sql';
import m0009 from './0009_sync_v2_vault_binding.sql';
import m0010 from './0010_sync_v2_heads.sql';
import m0011 from './0011_sync_v1_removal.sql';
import m0012 from './0012_retire_v1_pause_reasons.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
    m0011,
    m0012,
  },
};
