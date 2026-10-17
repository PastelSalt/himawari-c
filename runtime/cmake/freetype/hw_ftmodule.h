/*
 * FreeType modules Himawari-C registers (plan §8.1 size budget): TrueType and
 * OpenType/CFF fonts (including .ttc collections), the autohinter, and the
 * anti-aliased renderer. Type 1, CID, PFR, Type 42, Windows FNT, PCF, BDF,
 * SDF, and SVG glyphs are left out; a game's fonts are TTF/OTF/TTC.
 */
FT_USE_MODULE( FT_Module_Class, autofit_module_class )
FT_USE_MODULE( FT_Driver_ClassRec, tt_driver_class )
FT_USE_MODULE( FT_Driver_ClassRec, cff_driver_class )
FT_USE_MODULE( FT_Module_Class, psaux_module_class )
FT_USE_MODULE( FT_Module_Class, psnames_module_class )
FT_USE_MODULE( FT_Module_Class, pshinter_module_class )
FT_USE_MODULE( FT_Module_Class, sfnt_module_class )
FT_USE_MODULE( FT_Renderer_Class, ft_smooth_renderer_class )

/* EOF */
