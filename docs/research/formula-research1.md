**The largest improvements are to fix the heat balance, distinguish installed capacity from actual IT load, and replace universal temperature constants with cooling-specific models.** Published scenarios are preferable to historical grid-intensity extrapolation, but their emissions accounting must match Ember’s.

Below, **published values** are distinguished from **suggested screening assumptions**. The latter are useful for your hackathon but should not be presented as measured distributions or industry standards.

**1. PUE versus ambient temperature**

There is **no universally accepted PUE–ambient-temperature curve**, even within one cooling class. PUE also depends on humidity, equipment loading, supply temperatures, economizer operation, and electrical losses. ASHRAE distinguishes dry-bulb-driven dry cooling from wet-bulb-driven evaporative cooling. Its thermal classes describe equipment operating envelopes—not PUE curves. [handbook.ashrae.org](https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch20/a23_ch20_si.aspx?utm_source=chatgpt.com)

The defensible functional form is an energy balance:

\[
P_{\mathrm{facility},h}
=P_{\mathrm{IT},h}+P_{\mathrm{electrical\ losses},h}
+P_{\mathrm{fans/pumps},h}+P_{\mathrm{chiller},h}+P_{\mathrm{other},h}
\]

\[
P_{\mathrm{chiller},h}
=\frac{Q_{\mathrm{mechanically\ cooled},h}}
{COP(T_{\mathrm{evaporator}},T_{\mathrm{condenser}},\mathrm{part\ load})}
\]

\[
PUE_y=\frac{\sum_hP_{\mathrm{facility},h}\Delta t}
{\sum_hP_{\mathrm{IT},h}\Delta t}
\]

Annual PUE is therefore an **energy-weighted ratio**, not an unweighted average of hourly PUE.

| Cooling configuration | Appropriate temperature dependence | Suggested annual PUE default [screening range]¹ | One-line source |
|---|---|---:|---|
| Air-cooled DX/chiller, little economization | Compressor demand increases with outdoor dry-bulb temperature; use equipment COP/part-load curves. | **1.50 [1.30–1.80]** | Shehabi et al., *2024 US Data Center Energy Usage Report*, Fig. 4.4 compares simulated cooling configurations. [eta-publications.lbl.gov](https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report.pdf?stream=top\&utm_source=chatgpt.com) |
| Water-cooled chiller and cooling tower | Condenser conditions follow **wet-bulb temperature plus tower approach**; include tower fans and pumps. | **1.40 [1.20–1.70]** | Lei & Masanet, 2022, *Resources, Conservation & Recycling* 182, 106323, models coupled PUE/WUE. [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0921344922001719?utm_source=chatgpt.com) |
| Airside economizer with evaporative/adiabatic assistance | Piecewise operation: economizer → assisted cooling → mechanical backup; humidity constrains mode selection. | **1.20 [1.10–1.40]** | ASHRAE Handbook, Ch. 20: economizer operation depends on temperature, moisture and configuration. [handbook.ashrae.org](https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch20/a23_ch20_si.aspx?utm_source=chatgpt.com) |
| Warm-water direct liquid cooling or immersion, with dry/hybrid heat rejection | Dry-bulb relative to coolant temperature determines dry-cooling availability; wet-bulb matters during evaporative assistance. | **1.10 [1.05–1.25]** | DOE documents a liquid-cooled hybrid facility achieving **PUE 1.06**, demonstrating that 1.15 is not a physical floor. [Department of Energy](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers?utm_source=chatgpt.com) |
| Existing facility, cooling design unknown | Use measured annual PUE; otherwise a broad prior rather than a temperature-derived point estimate. | **1.54 [1.30–2.00]** | Uptime’s 2025 survey reports **1.54**, with the headline average nearly unchanged for six years. [datacenter.uptimeinstitute.com](https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2025.Annual.Survey.Report.pdf?version=0\&utm_source=chatgpt.com) |

¹ These are **my rounded screening defaults**, not quoted technology-specific confidence intervals. Underloaded or poorly operated facilities can exceed these ranges.

For a lightweight implementation, fit a surrogate to hourly engineering simulations or measured data:

\[
PUE_h=1+a_c+\frac{P_{\mathrm{fixed},c}}{P_{\mathrm{IT},h}}
+b_c\max(0,X_h-X_{0,c})
\]

Here \(X\) is dry-bulb, wet-bulb, or a computed effective inlet temperature, depending on cooling class. **Do not treat \(b_c=0.005/^\circ C\) or a 15 °C breakpoint as universal constants.** Lei & Masanet explicitly model location and technology rather than imposing one global slope. [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0921344922001719?utm_source=chatgpt.com)

For efficiency improvement, I recommend **0 automatic improvement for an unchanged facility**, with explicit retrofit years. If you need a smooth scenario, reduce *overhead* asymptotically:

\[
PUE_y=PUE_{\min}+(PUE_0-PUE_{\min})e^{-k(y-y_0)}
\]

A sensitivity assumption of \(k=0\)–\(0.03\ \mathrm{yr^{-1}}\) is usable, but **analyst-chosen**, not an established annual industry improvement rate.

**2. IT-load growth: evidence versus site assumptions**

**Sector electricity growth is not an individual facility’s load-growth rate.** A site reaches its electrical/cooling capacity; continued growth requires expansion or another site. Furthermore, “colocation” is an ownership/business category, whereas training and inference are workloads—these categories overlap.

| Category | Observed evidence covering the requested period | Published outlook | Recommended functional form |
|---|---|---|---|
| All data centers | IEA estimates approximately **12%/yr growth over 2019–2024**, reaching **415 TWh in 2024**. | Its 2025 outlook projected **945 TWh in 2030**. | Use as a **fleet-level cross-check**, not a site multiplier. IEA, *Energy and AI*, 2025. [IEA](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai?utm_source=chatgpt.com) |
| AI overall | IEA’s 2026 update estimates **50% electricity growth for AI-focused centers in 2025**; all centers grew **17%**, to **485 TWh**. | AI-focused electricity roughly **triples during 2025–2030**: calculated CAGR **24.6%**. All centers reach about **950 TWh**. | Aggregate scenario anchor; definitions differ from accelerator-only electricity. IEA, *Key Questions on Energy and AI*, 2026. [IEA](https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary?_bhlid=10646f272364cf3af59c0fa8f3886b1cfe01e627\&utm_source=chatgpt.com) |
| AI training | No verified, representative 2019–2025 **site-level annual electrical-load distribution** was identified. Frontier training-compute growth is not equivalent to electricity growth. | IEA’s 2025 **30%/yr accelerated-server electricity** projection combines uses; it is not a training-specific rate. | \(E_{\mathrm{train}}=\sum_j N_jP_{\mathrm{avg},j}t_j\), plus supporting IT and idle energy. [IEA](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai?utm_source=chatgpt.com) |
| AI inference | No comparable worldwide historical load distribution was identified separately from training. | No authoritative universal inference-specific annual rate through 2050 was identified. | \(E_{\mathrm{infer}}=N_{\mathrm{requests}}\epsilon_{\mathrm{request}}\), using workload-specific benchmarks that account for batching and utilization; add excluded idle/support energy. AI studies treat training/inference allocation as uncertain. [Nature Sustainability](https://www.nature.com/articles/s41893-025-01681-y?utm_source=chatgpt.com) |
| General/non-AI colo | Public aggregate data do not establish a universal distribution for an existing colo facility. | IEA projects **9%/yr conventional-server electricity growth to 2030**; this is not specifically colo growth. | Installed equipment × measured power curve × operating hours, with occupancy/capacity limits. [IEA](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai?utm_source=chatgpt.com) |
| Proof-of-work crypto | Cambridge’s 2025 report gives an annualized Bitcoin estimate of approximately **138 TWh**, **17% YoY growth**, associated with its June 2024 snapshot. | No authoritative universal 2030/2050 crypto-load trajectory was identified. | \(P_{\mathrm{IT}}=H\epsilon\): hashrate × joules/hash; constrain by capacity, economics and curtailment. Cambridge CCAF, 2025. [Cambridge Judge Business School](https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/?utm_source=chatgpt.com) |

For historical context, IEA’s 2019 review cited approximately **41 TWh/year** for Bitcoin under then-current assumptions. **Do not calculate a precise historical CAGR by joining that estimate to Cambridge’s newer survey estimate:** the methods differ. [IEA](https://www.iea.org/commentaries/bitcoin-energy-use-mined-the-gap?utm_source=chatgpt.com)

For your deterministic model, I would use the following **explicit scenario assumptions**, rather than inventing empirical probability distributions:

| Model setting | Low / central / high assumption | Interpretation |
|---|---|---|
| Existing, fully occupied site | **0% capacity growth** | Equipment refresh may change electricity use; additional capacity requires an expansion event. |
| Expanding AI fleet/campus, through 2030 | **10% / 25% / 40% annual electricity growth**, capacity-constrained | Central value approximates the recent IEA aggregate AI trajectory; bounds are your sensitivity choices. |
| Expanding general-compute fleet, through 2030 | **0% / 9% / 15%**, capacity-constrained | Conventional-server outlook is a proxy, not a colo-specific measurement. |
| Crypto site | **0% automatic capacity growth** | Enter expansion/closure explicitly; vary utilization and equipment efficiency separately. |
| 2031–2050 | Site-specific expansion schedule; otherwise **0% capacity growth** | Do not compound 25–30% growth to 2050. |

There are peer-reviewed longer-term scenarios, but they are not official global forecasts. For example, a 2026 China-focused study assumes progressively slower AI-server deployment through 2060; those are **study assumptions about deployment**, not measured worldwide electrical-load distributions. [nature.com](https://www.nature.com/articles/s44458-026-00080-4.pdf?utm_source=chatgpt.com)

If probabilistic behavior is added later, use a documented distribution fitted to actual comparable sites. Drawing an arbitrary new growth rate independently every year would create false statistical precision.

**3. Cooling water and WUE**

The standard denominator is **IT electricity**:

\[
WUE_{\mathrm{site}}=\frac{V_{\mathrm{site}}\;[\mathrm L]}
{E_{\mathrm{IT}}\;[\mathrm{kWh}]}
\]

Consequently:

\[
V_{\mathrm{site}}\;[\mathrm{m^3}]
=E_{\mathrm{IT}}\;[\mathrm{MWh}]
\times WUE_{\mathrm{site}}\;[\mathrm{L/kWh}]
\]

Mytton’s peer-reviewed review also distinguishes onsite water from electricity-generation water. [npj Clean Water](https://www.nature.com/articles/s41545-021-00101-w?utm_source=chatgpt.com)

**“Chilled water” and “immersion” do not determine water consumption by themselves.** You must specify how the final heat-rejection system works.

| Cooling technology | Accepted functional form / controlling variables | Suggested WUE default [screening range], L/kWh IT² | One-line citation |
|---|---|---:|---|
| Dry air-cooled chiller or dry cooler | Essentially no evaporative cooling-water requirement; account separately for humidification and other uses. | **0 [0–0.1]** | Berkeley Lab distinguishes dry cooling from water-consuming heat rejection. [eta-publications.lbl.gov](https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report.pdf?stream=top\&utm_source=chatgpt.com) |
| Adiabatic-assisted dry cooler | Water depends on **hours requiring wet assistance**, airflow and moisture addition. | **0.3 [0–1.0]** | DOE describes dry/wet hybrid switching according to outdoor conditions. [Department of Energy](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers?utm_source=chatgpt.com) |
| Direct evaporative air cooling | \(V_{\mathrm{evap}}\approx \int\dot m_{\mathrm{dry\,air}}(\omega_{\mathrm{out}}-\omega_{\mathrm{in}})\,dt/\rho_w\), plus purge. | **0.8 [0.2–2.0]** | Lei & Masanet, 2022: coupled thermodynamic PUE/WUE modeling. [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0921344922001719?utm_source=chatgpt.com) |
| Chilled-water loop with wet cooling tower | Tower evaporation depends on rejected heat; makeup also includes blowdown and drift. | **2.0 [1.0–3.0]** | DOE FEMP: cooling-tower makeup = evaporation + blowdown + drift. [Department of Energy](https://www.energy.gov/cmei/femp/best-management-practice-10-cooling-tower-management?utm_source=chatgpt.com) |
| Immersion/direct liquid + dry heat rejection | Closed coolant circulation is not consumptive water use; dry rejection needs no continuous evaporation. | **0 [0–0.1]** | ASHRAE separates liquid-cooled equipment from facility heat-rejection configuration. [handbook.ashrae.org](https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch20/a23_ch20_si.aspx?utm_source=chatgpt.com) |
| Immersion/direct liquid + wet/hybrid heat rejection | Apply the tower/hybrid water balance; immersion does **not** imply zero WUE. | **1.0 [0.2–2.5]** | DOE’s efficient liquid-cooled hybrid example reports **WUE 0.7**. [Department of Energy](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers?utm_source=chatgpt.com) |

² My deliberately broad **annual screening assumptions**, not measured confidence intervals or technology guarantees. Hot climates, operating choices and water quality can move values outside them.

A useful physical cross-check for towers is:

\[
V_{\mathrm{evap}}\approx
\frac{3.6}{h_{fg}}f_{\mathrm{latent}}Q_{\mathrm{rejected,kWh}}
\approx1.47\,f_{\mathrm{latent}}Q_{\mathrm{rejected,kWh}}\quad[\mathrm L]
\]

Here \(h_{fg}\approx2.45\ \mathrm{MJ/kg}\) near room temperature, and \(f_{\mathrm{latent}}\) is the fraction rejected through evaporation.

Neglecting drift:

\[
V_{\mathrm{makeup}}\approx
V_{\mathrm{evap}}\frac{C}{C-1}
\]

Use **cycles of concentration \(C=4\)** as a screening default, **3–6** for sensitivity. DOE discusses this operating range and its effect on makeup and blowdown. [Department of Energy](https://www.energy.gov/cmei/femp/best-management-practice-10-cooling-tower-management?utm_source=chatgpt.com)

Report **water withdrawal/makeup and consumptive loss separately** where possible: discharged blowdown is not automatically water consumed. Also separate potable/reclaimed water and add upstream electricity-related water only when a compatible grid-water factor is available.

**4. Country grid-intensity projections**

**Yes—use published scenario trajectories as the primary projection.** Keep historical regression as a clearly labeled fallback or comparison.

| Source/method | What it provides | Recommended use and limitation | Citation |
|---|---|---|---|
| [Ember yearly electricity data](https://ember-energy.org/data/yearly-electricity-data/) | Historical generation, emissions and intensity across 200+ geographies. | Historical baseline. Its standard dataset is not an all-country NZE/STEPS projection through 2050. | Ember, Yearly Electricity Data. [Ember](https://ember-energy.org/data/yearly-electricity-data/?utm_source=chatgpt.com) |
| [IEA WEO datasets](https://www.iea.org/data-and-statistics/data-product/world-energy-outlook-2025-free-dataset) | Published policy/scenario pathways. | Free data have selected country/region coverage; extended data provide more detail. **Do not assume every country has a published NZE series**—2025 NZE coverage is more limited. | IEA, WEO 2025 Free/Extended Dataset descriptions. [IEA](https://www.iea.org/data-and-statistics/data-product/world-energy-outlook-2025-free-dataset?utm_source=chatgpt.com) |
| [NGFS Scenario Explorer/data](https://www.ngfs.net/ngfs-scenarios-portal/data-resources/) | Open long-term transition scenarios and country-downscaled variables. | Useful broad-coverage alternative. Verify electricity-generation and electricity-sector-emissions availability for each model/country; downscaled countries are not independently modeled national plans. | NGFS scenario documentation describes downscaling to **184 countries**. [ngfs.net](https://www.ngfs.net/ngfs-scenarios-portal/faq/?utm_source=chatgpt.com) |
| National power-system scenarios | Country-specific generation mixes and retirement/buildout assumptions. | Prefer when sufficiently documented and consistent with your chosen scenario. Derive intensity from generation shares. | IEA/NGFS provide the broader scenario framework; national assumptions require their own citations. |
| [Cambium](https://www.nrel.gov/analysis/cambium.html), US only | Hourly regional electricity scenarios through 2050, including marginal emissions. | Particularly useful for estimating the **consequences of adding load**, rather than assigning an average footprint. | NREL, Cambium datasets and documentation. [NREL](https://www.nrel.gov/analysis/cambium.html?utm_source=chatgpt.com) |

Two compatible calculation routes are:

\[
CI_{c,y,s}=\sum_k
\underbrace{\frac{G_{c,k,y,s}}{\sum_kG_{c,k,y,s}}}_{\text{generation share}}
EF_{c,k,y,s}
\]

or, when the scenario reports matching electricity-sector emissions:

\[
CI\;[\mathrm{g/kWh}]
=1000\,\frac{M_{\mathrm{electricity}}\;[\mathrm{Mt/yr}]}
{G_{\mathrm{electricity}}\;[\mathrm{TWh/yr}]}
\]

Use **generation**, not installed capacity shares. Interpolate between published years; do not impose an unexplained change in trend after 2040.

Crucially, Ember’s standard emissions estimates include **lifecycle greenhouse gases expressed as CO₂e**. IEA/NGFS electricity-sector CO₂ series may have a different boundary. Either reconstruct future lifecycle intensity from projected generation mixes or change both historical and future accounting consistently. [files.ember-energy.org](https://files.ember-energy.org/public-downloads/ember_electricity_data_methodology.pdf?utm_source=chatgpt.com)

My recommended constants are therefore:

- **No universal 20 g/kWh floor or 1,000 g/kWh ceiling.** These are neither general physical bounds nor scenario requirements.
- **No universal ±6%/yr cap.** Retain it only as an explicitly artificial fallback safeguard.
- Use **STEPS/current-policy-like and faster-decarbonization alternatives**, not NZE as “the expected future.”
- Where only a regional scenario exists, identify the country result as a **regional proxy**, not a published country forecast.

Also distinguish **generation-average intensity**, **consumption intensity including imports**, and **marginal intensity**. Your “before versus after adding a data center” interface should label average-intensity multiplication as an **attributed footprint**; it does not establish the actual change in grid emissions. Cambium’s marginal-emissions work addresses this distinction. [NLR Data Catalog](https://data.nlr.gov/submissions/184?utm_source=chatgpt.com)

**5. Regional warming under SSP2-4.5**

I calculated the following specifically for **2026–2050**, using the IPCC Atlas’s public **34-model SSP2-4.5 land-temperature ensemble**, one realization per model. Monthly temperatures were converted to annual means, then an ordinary-least-squares trend was calculated for each model.

These are **my calculations from published model data**, not an IPCC-assessed table. The range is the **10th–90th percentile across model trends**, not a calibrated probability interval. The regional dataset and methodology are documented by Iturbide et al. [essd.copernicus.org](https://essd.copernicus.org/articles/12/2959/2020/essd-12-2959-2020.html?utm_source=chatgpt.com)

| IPCC region | Median °C/decade | Model P10–P90 |
|---|---:|---:|
| Northern Europe — NEU | **0.41** | −0.03–0.67 |
| Western/Central Europe — WCE | **0.34** | −0.03–0.67 |
| Eastern Europe — EEU | **0.54** | 0.04–0.82 |
| Mediterranean — MED | **0.29** | 0.11–0.50 |
| Western North America — WNA | **0.47** | 0.13–0.69 |
| Central North America — CNA | **0.46** | 0.18–0.74 |
| Eastern North America — ENA | **0.40** | 0.11–0.61 |
| Sahara — SAH | **0.34** | 0.15–0.50 |
| Western Africa — WAF | **0.31** | 0.19–0.45 |
| Central Africa — CAF | **0.29** | 0.20–0.46 |
| Eastern Southern Africa — ESAF | **0.31** | 0.17–0.51 |
| South Asia — SAS | **0.36** | 0.21–0.46 |
| East Asia — EAS | **0.32** | 0.19–0.49 |
| Southeast Asia — SEA | **0.26** | 0.16–0.37 |
| Northern Australia — NAU | **0.25** | 0.06–0.47 |
| Southern Australia — SAU | **0.29** | 0.13–0.45 |
| South American Monsoon — SAM | **0.36** | 0.19–0.57 |
| Southeastern South America — SES | **0.26** | 0.16–0.42 |
| Russian Arctic — RAR | **0.74** | 0.18–0.97 |

**Table source:** calculated from [IPCC-WG1/Atlas](https://github.com/IPCC-WG1/Atlas), `datasets-aggregated-regionally/data/CMIP6/CMIP6_tas_land`, SSP2-4.5 files. [GitHub](https://github.com/IPCC-WG1/Atlas?utm_source=chatgpt.com)

Small negative lower-percentile trends reflect regional variability over this particular 25-year window; they do not negate long-term warming.

For a site, use a **local monthly anomaly trajectory**, preferably from the [World Bank Climate Change Knowledge Portal](https://climateknowledgeportal.worldbank.org/download-data), which offers downscaled CMIP6 data:

\[
T_{\mathrm{site},m,y}
=T_{\mathrm{observed\ baseline},m}
+\left(T_{\mathrm{model},m,y}-T_{\mathrm{model\ baseline},m}\right)
\]

Keep the observational and model baseline periods aligned. CCKP supplies monthly/annual series and 20-year climatologies under SSP2-4.5. [datacatalog.worldbank.org](https://datacatalog.worldbank.org/infrastructure-data/search/dataset/0042297/climate-change-knowledge-portal-projected-climate-data-cmip6-0-25-degree?utm_source=chatgpt.com)

Your **0.03 °C/year** is a reasonable rough sensitivity assumption for some regions, but not a universal site projection. For cooling, seasonal temperature changes—and changes in humidity—matter more than one annual global drift.

**6. Physically wrong or misleading parts of the current model**

| Current element | Problem | Correction |
|---|---|---|
| `wasteHeat = IT_MW × (PUE−1)` | Counts infrastructure overhead but **omits IT heat**. | For an electrically powered facility, total heat generation is approximately **facility electricity consumption**. |
| Heat reported in MW as a yearly quantity | MW measures power, not annual heat energy. | Report average **MW thermal** and annual **MWh thermal** separately. |
| `IT_MW × PUE × 8760` | Correct only if IT MW means **annual average actual electrical demand**. | If it means capacity, apply an electrical load factor; do not confuse that with CPU utilization. |
| Water changes abruptly at 10 °C | No universal physical threshold; ignores technology and humidity. | Use cooling mode/weather dependence, or clearly labeled technology-specific annual WUE. |
| WUE multiplied by total facility energy | Wrong denominator for standard WUE. | Multiply by **IT energy**. |
| PUE improves automatically every year | Aging facilities do not automatically retrofit themselves. | Explicit upgrades or a labeled efficiency scenario. |
| PUE floor 1.15 | Excludes demonstrated better performance. | Use a design-specific minimum; physical lower bound is 1 for a consistently defined boundary. |
| Output labeled “CO₂” with Ember intensity | Usually mixes up CO₂ and lifecycle CO₂e. | Label the emissions boundary accurately. |
| Unlimited site growth | Eventually exceeds the grid connection and cooling plant. | Enforce IT and facility capacity limits. |
| Heat output interpreted as local temperature rise | Heat alone does not determine a temperature change. | A dispersion/urban-climate model is needed; do not convert MW directly to local °C. |
| All waste heat treated as reusable | Recoverability depends on temperature, infrastructure and coincident demand. | Model usable heat separately and include heat-pump electricity if needed. |

The heat correction follows conservation of energy: IT electricity becomes heat, and cooling/power-system electricity adds further heat. DOE’s cooling-system description explicitly follows heat from IT equipment through the rejection system. [Department of Energy](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers?utm_source=chatgpt.com)

**Suggested updated model**

Keep the model deterministic, but run **explicit scenarios** and preserve the source/version for every input.

1. **Load:** store IT capacity, actual electrical load factor, commissioning year and expansion events.
2. **Weather:** use hourly typical-year weather with monthly SSP2-4.5 anomalies; temperature-bin calculations are a useful lightweight alternative.
3. **Cooling:** select both the IT cooling method and final heat-rejection method; calculate energy and water together.
4. **Grid:** interpolate a published scenario with a consistent emissions boundary.
5. **Outputs:** distinguish attributed emissions, onsite water, upstream water, total heat and usable recovered heat.

The annual accounting can remain simple:

\[
\boxed{
\begin{aligned}
E_{\mathrm{IT},y} &= \sum_h P_{\mathrm{IT},h}\Delta t\\
E_{\mathrm{facility},y} &= \sum_h P_{\mathrm{facility},h}\Delta t\\
GHG_y\;[\mathrm t] &=
E_{\mathrm{grid},y}\;[\mathrm{MWh}]
\frac{CI_y\;[\mathrm{gCO_2e/kWh}]}{1000}
+GHG_{\mathrm{onsite},y}\\
V_{\mathrm{site},y}\;[\mathrm{m^3}] &=
E_{\mathrm{IT},y}\;[\mathrm{MWh}]\times WUE_y\\
Q_{\mathrm{generated},y}\;[\mathrm{MWh_{th}}] &\approx
E_{\mathrm{facility},y}\;[\mathrm{MWh}]
\end{aligned}}
\]

The heat approximation assumes an electricity-only facility with negligible annual energy storage; onsite fuel generation needs its own fuel/heat balance.

**Sanity check:** a constant **10 MW actual IT load**, PUE **1.3**, WUE **1 L/kWh IT**, and grid intensity **400 gCO₂e/kWh**, over 8,760 hours, gives:

| Output | Result |
|---|---:|
| IT electricity | 87,600 MWh/year |
| Facility electricity | 113,880 MWh/year |
| Electricity-attributed emissions | 45,552 tCO₂e/year |
| Onsite water | 87,600 m³/year |
| Total heat generated | Approximately **13 MW thermal**, or **113,880 MWh thermal/year** |
| Your current heat formula | **3 MW**—only the overhead contribution |

For presentation, label results **“scenario estimates”** and show low/central/high cases. That is more defensible than presenting one smooth 2026–2050 curve as a precise prediction.