-- CBSE Class XII Physics taxonomy (NCERT, rationalised syllabus from 2023-24).
-- Chapters -> topics -> concepts. The AI tagger may only choose from these rows.
-- Communication Systems was dropped from the syllabus for the 2023 exams but is kept
-- so that older PYQs can still be tagged.

create or replace function seed_concepts(
  p_subject text, p_class int, p_number int, p_chapter text, p_removed int, p_topics jsonb
) returns void language plpgsql as $$
declare
  ch_id uuid;
  tp_id uuid;
  tp jsonb;
  cn text;
begin
  insert into chapters (subject_code, class_level, ncert_number, name, removed_from_syllabus_in)
  values (p_subject, p_class, p_number, p_chapter, p_removed)
  on conflict (subject_code, class_level, name) do update set ncert_number = excluded.ncert_number
  returning id into ch_id;

  for tp in select * from jsonb_array_elements(p_topics) loop
    insert into topics (chapter_id, name) values (ch_id, tp->>'topic')
    on conflict (chapter_id, name) do update set name = excluded.name
    returning id into tp_id;
    for cn in select * from jsonb_array_elements_text(tp->'concepts') loop
      insert into concepts (topic_id, name) values (tp_id, cn) on conflict do nothing;
    end loop;
  end loop;
end $$;

select seed_concepts('physics', 12, 1, 'Electric Charges and Fields', null, '[
  {"topic": "Electric charge", "concepts": ["Quantisation of charge", "Conservation of charge", "Charging by induction"]},
  {"topic": "Coulomb''s law", "concepts": ["Inverse-square dependence of force", "Superposition of forces", "Effect of medium (permittivity)"]},
  {"topic": "Electric field", "concepts": ["Field due to a point charge", "Electric field lines", "Field of a system of charges"]},
  {"topic": "Electric dipole", "concepts": ["Dipole moment", "Field on axial and equatorial lines", "Torque on a dipole in a uniform field"]},
  {"topic": "Gauss''s law", "concepts": ["Electric flux", "Field of an infinite line charge", "Field of an infinite plane sheet", "Field of a uniformly charged thin spherical shell"]}
]');

select seed_concepts('physics', 12, 2, 'Electrostatic Potential and Capacitance', null, '[
  {"topic": "Electric potential", "concepts": ["Potential due to a point charge", "Potential due to a dipole", "Potential due to a system of charges", "Relation between field and potential"]},
  {"topic": "Equipotential surfaces", "concepts": ["Properties of equipotential surfaces"]},
  {"topic": "Potential energy", "concepts": ["Potential energy of a system of charges", "Potential energy of a dipole in an external field"]},
  {"topic": "Conductors and dielectrics", "concepts": ["Electrostatics of conductors", "Polarisation and dielectric constant"]},
  {"topic": "Capacitors", "concepts": ["Parallel plate capacitor", "Effect of dielectric on capacitance", "Capacitors in series and parallel", "Energy stored in a capacitor"]}
]');

select seed_concepts('physics', 12, 3, 'Current Electricity', null, '[
  {"topic": "Electric current and drift", "concepts": ["Drift velocity", "Mobility", "Relation between current and drift velocity"]},
  {"topic": "Ohm''s law and resistance", "concepts": ["Ohm''s law", "Resistivity and its temperature dependence", "Limitations of Ohm''s law"]},
  {"topic": "Electrical energy and power", "concepts": ["Power dissipated in a resistor"]},
  {"topic": "Cells", "concepts": ["EMF and internal resistance", "Cells in series and parallel"]},
  {"topic": "Kirchhoff''s rules", "concepts": ["Junction rule", "Loop rule", "Wheatstone bridge"]},
  {"topic": "Combination of resistors", "concepts": ["Resistors in series and parallel"]}
]');

select seed_concepts('physics', 12, 4, 'Moving Charges and Magnetism', null, '[
  {"topic": "Magnetic force", "concepts": ["Lorentz force", "Motion of a charge in a magnetic field", "Force on a current-carrying conductor"]},
  {"topic": "Biot-Savart law", "concepts": ["Field on the axis of a circular loop"]},
  {"topic": "Ampere''s circuital law", "concepts": ["Field of a long straight wire", "Field inside a solenoid"]},
  {"topic": "Forces between currents", "concepts": ["Force between two parallel currents"]},
  {"topic": "Torque on a current loop", "concepts": ["Magnetic dipole moment of a loop", "Moving coil galvanometer", "Conversion of galvanometer to ammeter and voltmeter"]}
]');

select seed_concepts('physics', 12, 5, 'Magnetism and Matter', null, '[
  {"topic": "Bar magnet", "concepts": ["Magnetic field lines", "Bar magnet as an equivalent solenoid", "Dipole in a uniform magnetic field"]},
  {"topic": "Gauss''s law for magnetism", "concepts": ["Zero net magnetic flux through a closed surface"]},
  {"topic": "Magnetic properties of materials", "concepts": ["Magnetisation and intensity", "Magnetic susceptibility", "Diamagnetism", "Paramagnetism", "Ferromagnetism and hysteresis"]}
]');

select seed_concepts('physics', 12, 6, 'Electromagnetic Induction', null, '[
  {"topic": "Faraday''s law", "concepts": ["Magnetic flux", "Induced EMF"]},
  {"topic": "Lenz''s law", "concepts": ["Direction of induced current", "Conservation of energy in induction"]},
  {"topic": "Motional EMF", "concepts": ["EMF of a rod moving in a magnetic field"]},
  {"topic": "Inductance", "concepts": ["Self-inductance", "Mutual inductance", "Energy stored in an inductor"]},
  {"topic": "AC generator", "concepts": ["Working of an AC generator"]}
]');

select seed_concepts('physics', 12, 7, 'Alternating Current', null, '[
  {"topic": "AC basics", "concepts": ["Peak and RMS values", "Phasors"]},
  {"topic": "AC circuits", "concepts": ["AC through a resistor", "AC through an inductor (inductive reactance)", "AC through a capacitor (capacitive reactance)", "Series LCR circuit and impedance", "Resonance and quality factor"]},
  {"topic": "Power in AC circuits", "concepts": ["Average power and power factor", "Wattless current"]},
  {"topic": "Transformers", "concepts": ["Transformer ratio", "Energy losses in transformers"]}
]');

select seed_concepts('physics', 12, 8, 'Electromagnetic Waves', null, '[
  {"topic": "Displacement current", "concepts": ["Displacement current", "Maxwell''s equations (qualitative)"]},
  {"topic": "Electromagnetic waves", "concepts": ["Transverse nature of EM waves", "Relation between E, B and c"]},
  {"topic": "Electromagnetic spectrum", "concepts": ["Order and uses of the EM spectrum"]}
]');

select seed_concepts('physics', 12, 9, 'Ray Optics and Optical Instruments', null, '[
  {"topic": "Reflection", "concepts": ["Mirror formula", "Magnification by spherical mirrors"]},
  {"topic": "Refraction", "concepts": ["Snell''s law", "Apparent depth", "Total internal reflection"]},
  {"topic": "Refraction at spherical surfaces and lenses", "concepts": ["Refraction at a spherical surface", "Lens maker''s formula", "Thin lens formula", "Power of a lens", "Combination of thin lenses"]},
  {"topic": "Prism", "concepts": ["Angle of minimum deviation", "Dispersion"]},
  {"topic": "Optical instruments", "concepts": ["Simple microscope", "Compound microscope", "Astronomical telescope"]}
]');

select seed_concepts('physics', 12, 10, 'Wave Optics', null, '[
  {"topic": "Huygens'' principle", "concepts": ["Wavefronts", "Reflection and refraction using Huygens'' principle"]},
  {"topic": "Interference", "concepts": ["Coherent sources", "Young''s double slit experiment", "Fringe width"]},
  {"topic": "Diffraction", "concepts": ["Single slit diffraction", "Width of central maximum"]},
  {"topic": "Polarisation", "concepts": ["Malus'' law", "Polarisation by reflection (Brewster''s law)"]}
]');

select seed_concepts('physics', 12, 11, 'Dual Nature of Radiation and Matter', null, '[
  {"topic": "Photoelectric effect", "concepts": ["Work function", "Effect of intensity and frequency", "Stopping potential", "Einstein''s photoelectric equation"]},
  {"topic": "Matter waves", "concepts": ["De Broglie wavelength", "De Broglie wavelength of an electron accelerated through a potential"]}
]');

select seed_concepts('physics', 12, 12, 'Atoms', null, '[
  {"topic": "Atomic models", "concepts": ["Alpha-particle scattering", "Distance of closest approach and impact parameter"]},
  {"topic": "Bohr model", "concepts": ["Bohr''s postulates", "Radius and energy of orbits", "Line spectra of hydrogen"]}
]');

select seed_concepts('physics', 12, 13, 'Nuclei', null, '[
  {"topic": "Nuclear structure", "concepts": ["Nuclear size and density", "Isotopes, isobars, isotones"]},
  {"topic": "Mass-energy and binding energy", "concepts": ["Mass defect", "Binding energy per nucleon curve"]},
  {"topic": "Nuclear force", "concepts": ["Properties of nuclear force"]},
  {"topic": "Nuclear energy", "concepts": ["Nuclear fission", "Nuclear fusion"]}
]');

select seed_concepts('physics', 12, 14, 'Semiconductor Electronics: Materials, Devices and Simple Circuits', null, '[
  {"topic": "Semiconductors", "concepts": ["Energy bands", "Intrinsic semiconductors", "Extrinsic (n-type and p-type) semiconductors"]},
  {"topic": "p-n junction", "concepts": ["Formation of depletion layer", "Forward and reverse bias", "V-I characteristics of a diode"]},
  {"topic": "Diode applications", "concepts": ["Half-wave rectifier", "Full-wave rectifier"]}
]');

select seed_concepts('physics', 12, 15, 'Communication Systems', 2023, '[
  {"topic": "Communication systems", "concepts": ["Elements of a communication system", "Bandwidth of signals", "Modulation and its need", "Amplitude modulation", "Propagation of EM waves"]}
]');

drop function seed_concepts(text, int, int, text, int, jsonb);
