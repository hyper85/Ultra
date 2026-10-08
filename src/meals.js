/* The meal library. Danish keys for t(); four ideas per meal, per diet, per variant, so the day of the year picks a
   different set every day. "carb" is for the days with work (long run, hard session, race), "protein" for the calm
   ones, "recover" is the meal right after a session: protein plus carbohydrate within the hour. */
export const MEALS = {
  all: {
    morgenmad: {
      carb: ["Havregrød med banan, rosiner og skyr", "Risengrød med kanelsukker og et glas juice", "Pandekager med skyr, bær og sirup", "Rugbrød med honning og banan, og et glas mælk"],
      protein: ["Æggemad på rugbrød med skyr og bær", "Omelet med spinat, tomat og ost", "Skyr med nødder, frø og lidt müsli", "Røræg med laks og rugbrød"],
      recover: ["Skyr med müsli, banan og honning", "Røræg på rugbrød og et glas chokolademælk", "Havregrød med skyr, bær og hakkede nødder", "Smoothie på mælk, banan, skyr og havregryn"],
    },
    frokost: {
      carb: ["Rugbrød med kylling, kartoffelsalat og grønt", "Pastasalat med tun, ærter og tomat", "Wrap med kylling, ris og salsa", "Rugbrød med frikadeller og rødkål, plus en banan"],
      protein: ["Stor salat med kylling eller tun, æg og olivenolie", "Rugbrød med æg, makrel og tomat", "Kyllingesalat med avocado, agurk og feta", "Rester fra aftensmaden med ekstra grønt"],
      recover: ["Rugbrød med kylling og en skål skyr med bær", "Bowl med ris, laks, edamame og sojasauce", "Pasta med kylling, ærter og pesto", "Sandwich med æg, kylling og salat, og et glas mælk"],
    },
    aftensmad: {
      carb: ["Pasta eller ris med laks eller kylling og masser af grønt", "Kyllingewok med nudler og grønt", "Lasagne med salat", "Risotto med kylling og ærter"],
      protein: ["Fisk eller kød med ovnbagte grøntsager og en lille portion kartofler", "Laks med broccoli og hollandaise", "Kylling i karry med blomkålsris", "Oksekød med grønne bønner og en lille kartoffel"],
      recover: ["Kylling med ris, grønt og en skål skyr til dessert", "Laks med kartofler og ærter", "Pasta med kødsauce og salat", "Chili con carne med ris"],
    },
    mellem: {
      carb: ["Banan, dadler eller en skål müsli med mælk", "Rugbrød med honning", "Rosinbolle og et glas juice", "En skål havregryn med mælk og rosiner"],
      protein: ["Skyr med bær, eller et par æg", "Hytteost med agurk og peber", "En håndfuld nødder og en ost", "Kogte æg med lidt salt"],
      recover: ["Chokolademælk og en banan", "Skyr med müsli", "Rugbrød med æg og en banan", "Proteinshake på mælk og en håndfuld rosiner"],
    },
  },
  veg: {
    morgenmad: {
      carb: ["Havregrød med banan, rosiner og skyr", "Risengrød med kanelsukker og et glas juice", "Pandekager med skyr, bær og sirup", "Rugbrød med honning og banan, og et glas mælk"],
      protein: ["Æg med rugbrød, hytteost og tomat", "Omelet med spinat, tomat og ost", "Skyr med nødder, frø og lidt müsli", "Røræg med feta og rugbrød"],
      recover: ["Skyr med müsli, banan og honning", "Røræg på rugbrød og et glas chokolademælk", "Havregrød med skyr, bær og hakkede nødder", "Smoothie på mælk, banan, skyr og havregryn"],
    },
    frokost: {
      carb: ["Rugbrød med æg, hummus og salat, og et stykke frugt", "Pastasalat med bønner, ærter og tomat", "Wrap med falafel, ris og salsa", "Rugbrød med kartoffel, ost og purløg, plus en banan"],
      protein: ["Salat med linser, feta, æg og olivenolie", "Rugbrød med falafel, hummus og syltede rødløg", "Græsk salat med kikærter, feta og æg", "Rester fra aftensmaden med ekstra grønt"],
      recover: ["Rugbrød med æg og en skål skyr med bær", "Bowl med ris, edamame, æg og sojasauce", "Pasta med kikærter, ærter og pesto", "Sandwich med æg, ost og salat, og et glas mælk"],
    },
    aftensmad: {
      carb: ["Pasta med tomatsauce, bønner og ost, eller ris med tofu og grønt", "Grøntsagswok med nudler og æg", "Lasagne med linser og salat", "Risotto med ærter og parmesan"],
      protein: ["Tofu eller tempeh med ovnbagte grøntsager og kikærter", "Halloumi med broccoli og salat", "Linsekarry med blomkålsris", "Omelet med ost, grønt og en lille kartoffel"],
      recover: ["Tofu med ris, grønt og en skål skyr til dessert", "Bønnegryde med kartofler og ærter", "Pasta med linsesauce og salat", "Chili sin carne med ris"],
    },
    mellem: {
      carb: ["Banan, dadler eller müsli med mælk", "Rugbrød med honning", "Rosinbolle og et glas juice", "En skål havregryn med mælk og rosiner"],
      protein: ["Skyr eller kvark med bær, eller hytteost", "Hytteost med agurk og peber", "En håndfuld nødder og en ost", "Kogte æg med lidt salt"],
      recover: ["Chokolademælk og en banan", "Skyr med müsli", "Rugbrød med æg og en banan", "Proteinshake på mælk og en håndfuld rosiner"],
    },
  },
  vegan: {
    morgenmad: {
      carb: ["Havregrød på havredrik med banan, rosiner og sirup", "Risengrød på havredrik med kanelsukker og juice", "Pandekager på havredrik med bær og sirup", "Rugbrød med peanutbutter og banan"],
      protein: ["Sojaskyr med müsli, frø og bær", "Tofu-scramble med spinat og rugbrød", "Chiagrød på sojadrik med nødder og bær", "Rugbrød med hummus, tomat og græskarkerner"],
      recover: ["Sojaskyr med müsli, banan og sirup", "Smoothie på sojadrik, banan, havregryn og ærteprotein", "Havregrød på sojadrik med bær og hakkede nødder", "Tofu-scramble på rugbrød og et glas juice"],
    },
    frokost: {
      carb: ["Rugbrød med hummus og grønt, plus frugt", "Pastasalat med bønner, ærter og tomat", "Wrap med falafel, ris og salsa", "Rugbrød med kartoffel og remoulade, plus en banan"],
      protein: ["Salat med linser, edamame, kikærter og tahin", "Rugbrød med tofu, hummus og tomat", "Bowl med kikærter, avocado, agurk og tahin", "Rester fra aftensmaden med ekstra grønt"],
      recover: ["Rugbrød med hummus og en skål sojaskyr med bær", "Bowl med ris, edamame, tofu og sojasauce", "Pasta med kikærter, ærter og pesto", "Sandwich med tofu og salat, og et glas sojadrik"],
    },
    aftensmad: {
      carb: ["Ris eller pasta med tofu, bønner og grønt", "Grøntsagswok med nudler og tofu", "Lasagne med linser og salat", "Risotto med ærter og gær-flager"],
      protein: ["Tempeh eller seitan med ovnbagte grøntsager og en lille portion kartofler", "Tofu med broccoli og peanutsauce", "Linsekarry med blomkålsris", "Bønnebøffer med grønt og en lille kartoffel"],
      recover: ["Tofu med ris, grønt og en skål sojaskyr til dessert", "Bønnegryde med kartofler og ærter", "Pasta med linsesauce og salat", "Chili sin carne med ris"],
    },
    mellem: {
      carb: ["Banan, dadler eller tørret mango", "Rugbrød med marmelade", "Rosinbolle og et glas juice", "En skål havregryn med havredrik og rosiner"],
      protein: ["Sojaskyr, edamame eller en shake på ærteprotein", "Hummus med gulerod og agurk", "En håndfuld nødder og edamame", "Ristede kikærter med salt"],
      recover: ["Sojadrik med kakao og en banan", "Sojaskyr med müsli", "Rugbrød med hummus og en banan", "Shake på ærteprotein og sojadrik, og en håndfuld rosiner"],
    },
  },
  lowcarb: {
    morgenmad: {
      carb: ["Havregrød med banan, kun i dag: turen kræver det", "Rugbrød med honning og skyr, kun i dag", "Pandekager med skyr og bær, kun i dag", "Risengrød med kanelsukker, kun i dag"],
      protein: ["Æg og bacon eller skyr med frø og bær", "Omelet med ost, spinat og tomat", "Skyr med nødder og frø", "Røræg med laks og avocado"],
      recover: ["Skyr med bær, nødder og en banan", "Røræg på rugbrød og et glas mælk", "Omelet med ost og en banan", "Smoothie på mælk, skyr og bær"],
    },
    frokost: {
      carb: ["Rugbrød med kylling og en banan til turen", "Pastasalat med tun og ærter, kun i dag", "Wrap med kylling og ris, kun i dag", "Rugbrød med frikadeller, plus en banan"],
      protein: ["Salat med kylling, æg, avocado og olivenolie", "Rugbrød med æg, makrel og tomat", "Kyllingesalat med feta og oliven", "Rester fra aftensmaden med ekstra grønt"],
      recover: ["Kylling med en lille portion ris og grønt", "Bowl med laks, edamame og en skefuld ris", "Omelet med kylling og en banan", "Sandwich med æg, kylling og salat"],
    },
    aftensmad: {
      carb: ["Kød eller fisk med ris eller kartofler, mere end du plejer", "Kyllingewok med nudler og grønt, kun i dag", "Laks med kartofler og ærter, kun i dag", "Pasta med kødsauce, kun i dag"],
      protein: ["Kød eller fisk med grønt i olie eller smør", "Laks med broccoli og hollandaise", "Kylling i karry med blomkålsris", "Oksekød med grønne bønner og salat"],
      recover: ["Kylling med grønt og en lille portion kartofler", "Laks med en lille portion ris og ærter", "Kødsauce med squash-nudler og en banan", "Chili con carne med en lille portion ris"],
    },
    mellem: {
      carb: ["Dadler eller en gel til turen", "En banan før turen", "Rugbrød med honning, kun i dag", "Rosiner og en håndfuld nødder"],
      protein: ["Ost, nødder eller et par æg", "Hytteost med agurk og peber", "En håndfuld nødder og en ost", "Kogte æg med lidt salt"],
      recover: ["Skyr med en banan", "Proteinshake på mælk", "Et par æg og en banan", "Hytteost med bær"],
    },
  },
};
