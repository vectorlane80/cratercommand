import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('retro-backdrop', 'assets/retro/backdrop.png');
    this.load.image('retro-cactus', 'assets/retro/cactus.png');
    this.load.image('retro-tank-blue', 'assets/retro/tank_blue.png');
    this.load.image('retro-tank-red', 'assets/retro/tank_red.png');

    this.load.image('hires-backdrop', 'assets/hires/backdrop.png');
    this.load.image('hires-cactus', 'assets/hires/cactus.png');
    this.load.image('hires-tank-blue', 'assets/hires/tank_blue.png');
    this.load.image('hires-tank-red', 'assets/hires/tank_red.png');
    this.load.image('hires-barrel-blue', 'assets/hires/barrel_blue.png');
    this.load.image('hires-barrel-red', 'assets/hires/barrel_red.png');
    this.load.image('hires-shell', 'assets/hires/shell.png');
    this.load.image('hires-chute', 'assets/hires/chute.png');
    this.load.image('hires-rock', 'assets/hires/rock.png');
    this.load.image('hires-logo', 'assets/hires/logo.png');
    this.load.image('hires-mini-tank-blue', 'assets/hires/mini_tank_blue.png');
    this.load.image('hires-mini-tank-red', 'assets/hires/mini_tank_red.png');
    this.load.spritesheet('hires-blast', 'assets/hires/blast.png', { frameWidth: 128, frameHeight: 128 });

    // Terrain panoramas and props (57 files from public/assets/terrain/)
    // Panorama backdrops for all terrains (retro and hires)
    this.load.image('sky_desert_retro', 'assets/terrain/sky_desert_retro.png');
    this.load.image('sky_desert_hires', 'assets/terrain/sky_desert_hires.png');
    this.load.image('sky_forest_retro', 'assets/terrain/sky_forest_retro.png');
    this.load.image('sky_forest_hires', 'assets/terrain/sky_forest_hires.png');
    this.load.image('sky_snow_retro', 'assets/terrain/sky_snow_retro.png');
    this.load.image('sky_snow_hires', 'assets/terrain/sky_snow_hires.png');
    this.load.image('sky_volcanic_retro', 'assets/terrain/sky_volcanic_retro.png');
    this.load.image('sky_volcanic_hires', 'assets/terrain/sky_volcanic_hires.png');
    this.load.image('sky_lunar_retro', 'assets/terrain/sky_lunar_retro.png');
    this.load.image('sky_lunar_hires', 'assets/terrain/sky_lunar_hires.png');
    this.load.image('sky_urban_retro', 'assets/terrain/sky_urban_retro.png');
    this.load.image('sky_urban_hires', 'assets/terrain/sky_urban_hires.png');
    this.load.image('sky_alien_retro', 'assets/terrain/sky_alien_retro.png');
    this.load.image('sky_alien_hires', 'assets/terrain/sky_alien_hires.png');

    // Forest props (retro and hires)
    this.load.image('forest_retro_conifer', 'assets/terrain/forest_retro_conifer.png');
    this.load.image('forest_retro_fern', 'assets/terrain/forest_retro_fern.png');
    this.load.image('forest_retro_log', 'assets/terrain/forest_retro_log.png');
    this.load.image('forest_hires_conifer', 'assets/terrain/forest_hires_conifer.png');
    this.load.image('forest_hires_fern', 'assets/terrain/forest_hires_fern.png');
    this.load.image('forest_hires_log', 'assets/terrain/forest_hires_log.png');

    // Snow props (retro and hires)
    this.load.image('snow_retro_conifer_snow', 'assets/terrain/snow_retro_conifer_snow.png');
    this.load.image('snow_retro_boulder_snow', 'assets/terrain/snow_retro_boulder_snow.png');
    this.load.image('snow_retro_log_snow', 'assets/terrain/snow_retro_log_snow.png');
    this.load.image('snow_hires_conifer_snow', 'assets/terrain/snow_hires_conifer_snow.png');
    this.load.image('snow_hires_boulder_snow', 'assets/terrain/snow_hires_boulder_snow.png');
    this.load.image('snow_hires_log_snow', 'assets/terrain/snow_hires_log_snow.png');

    // Volcanic props (retro and hires)
    this.load.image('volcanic_retro_basalt', 'assets/terrain/volcanic_retro_basalt.png');
    this.load.image('volcanic_retro_vent', 'assets/terrain/volcanic_retro_vent.png');
    this.load.image('volcanic_retro_snag', 'assets/terrain/volcanic_retro_snag.png');
    this.load.image('volcanic_hires_basalt', 'assets/terrain/volcanic_hires_basalt.png');
    this.load.image('volcanic_hires_vent', 'assets/terrain/volcanic_hires_vent.png');
    this.load.image('volcanic_hires_snag', 'assets/terrain/volcanic_hires_snag.png');

    // Lunar props (retro and hires)
    this.load.image('lunar_retro_boulder', 'assets/terrain/lunar_retro_boulder.png');
    this.load.image('lunar_retro_crater', 'assets/terrain/lunar_retro_crater.png');
    this.load.image('lunar_retro_mast', 'assets/terrain/lunar_retro_mast.png');
    this.load.image('lunar_hires_boulder', 'assets/terrain/lunar_hires_boulder.png');
    this.load.image('lunar_hires_crater', 'assets/terrain/lunar_hires_crater.png');
    this.load.image('lunar_hires_mast', 'assets/terrain/lunar_hires_mast.png');

    // Urban props (retro and hires)
    this.load.image('urban_retro_slab', 'assets/terrain/urban_retro_slab.png');
    this.load.image('urban_retro_lamppost', 'assets/terrain/urban_retro_lamppost.png');
    this.load.image('urban_retro_husk', 'assets/terrain/urban_retro_husk.png');
    this.load.image('urban_hires_slab', 'assets/terrain/urban_hires_slab.png');
    this.load.image('urban_hires_lamppost', 'assets/terrain/urban_hires_lamppost.png');
    this.load.image('urban_hires_husk', 'assets/terrain/urban_hires_husk.png');

    // Alien props (retro and hires)
    this.load.image('alien_retro_spire', 'assets/terrain/alien_retro_spire.png');
    this.load.image('alien_retro_pod', 'assets/terrain/alien_retro_pod.png');
    this.load.image('alien_retro_arch', 'assets/terrain/alien_retro_arch.png');
    this.load.image('alien_hires_spire', 'assets/terrain/alien_hires_spire.png');
    this.load.image('alien_hires_pod', 'assets/terrain/alien_hires_pod.png');
    this.load.image('alien_hires_arch', 'assets/terrain/alien_hires_arch.png');
  }

  create(): void {
    const fontLoads = [
      document.fonts.load('600 16px "Barlow Condensed"'),
      document.fonts.load('700 16px "Barlow Condensed"'),
      document.fonts.load('400 12px "JetBrains Mono"')
    ];
    Promise.all(fontLoads).catch(() => undefined).finally(() => this.scene.start('MenuScene'));
  }
}
