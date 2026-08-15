// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_public_scrambler.sql';
import m0001 from './0001_clammy_winter_soldier.sql';
import m0002 from './0002_marvelous_avengers.sql';
import m0003 from './0003_common_silhouette.sql';
import m0004 from './0004_good_roulette.sql';
import m0005 from './0005_normal_mauler.sql';
import m0006 from './0006_classy_roxanne_simpson.sql';
import m0007 from './0007_confused_infant_terrible.sql';
import m0008 from './0008_gorgeous_thor.sql';
import m0009 from './0009_nebulous_bulldozer.sql';
import m0010 from './0010_mysterious_eternals.sql';

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
  },
};
