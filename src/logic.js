// Table which represents truth table
const tableElem = document.getElementById('logic-table');
// Element which stores UI error messages
const errorElem = document.getElementById('logic-error');
// Performance text element
const performanceTextElem = document.getElementById('performance-text');

// Stores the current truth table
let currentTruthTable = null;

/**
 * Regular expressions used throughout the application,
 * mostly for finding and replacing propositional logic operands
 * such as 'and', 'then', '->' etc with JavaScript operands
 */
const regularExpressions = {
    'true': /(?<= |^|\(|\))(T|true)(?= |$|\(|\))+/g,
    'false': /(?<= |^|\(|\))(F|false)(?= |$|\(|\))+/g,
    'and': /(?<= |^)(and|[&]|\/\\|\^)+(?= |$)/g,    // and = &&
    'or': /(?<= |^)(or|[\|]|\\\/)+(?= |$)/g,    // or = ||
    'not': /(?<= |^|\(|\))(not |not|!|¬)+/g,        // not = !
    'thenWrap': /(.[^-]+?)(?:then|(?<!<)-+>)(.+)/g,     // p then q = !p || q
    'then': /(then|(?<!<)-+>)/g,                    // then, but without capturing left or right side
    'equals': /(?<= |^)(<-+>|=)+(?= |$)/g,            // <-> = ==
    'xor': /(?<= |^)(\(\+\)|xor)+(?= |$)/g,         // (+) = ^ (bit-wise XOR)
    'premises': /[^\W\s01]+/g,                        // Identifies any words, i.e our premises/variables, p, q, ...n
}

function calculateTruthTable(logic) {

    // Seperate logic by commas, and generate a truth table column for each
    let logics = logic.split(',');
    let codes = logics.map(logic => parse(logic));

    // Transforming to Set and back to Array weeds out duplicate values
    let premiseOrder = [ ...new Set(codes.join(',').match(regularExpressions.premises)) ];

    // Cartesian product, e.g every possible combination of p, q, ...n
    let premiseCartesian = cartesianProduct(premiseOrder.map(() => [true, false]));

    // Loop over each possible combination
    for( let i = 0; i < premiseCartesian.length; i++ ) {
        // A copy of the code literal which we will modify to represent this row's truth value
        let rowCodes = codes;

        // Iterate over each premise, and replace its value in each code literal for this iterations combo.
        for( let j = 0; j < premiseOrder.length; j++ ) {
            rowCodes = rowCodes.map(rowCode => rowCode.replaceAll(new RegExp(`\\b(${premiseOrder[j]})\\b`, 'gi'), premiseCartesian[i][j]))
        }

        // Iterate over each row code and eval it, and add to this row in the cartesian
        rowCodes.forEach(rowCode => {

            try {
                premiseCartesian[i].push(eval(rowCode));
            } catch (err) {
                err.rowCode = rowCode;
                throw err;
            }

        });
    }

    return [ [ ...premiseOrder, ...logics ], ...premiseCartesian ];
}

// Gets triggered when the main HTML input element is changed
function onInputChange( value ) {
    let performanceStart = performance.now();

    try {
        errorElem.style.display = 'none';

        let truthTable = calculateTruthTable(value);

        // Generate table headers
        tableElem.querySelector('thead > tr').innerHTML = 
            truthTable[0].map(p => `<th>${prettyPrint(p)}</th>`).join('');
    
        // Clear tbody
        tableElem.querySelector('tbody').innerHTML = null;
    
        // Loop over each possible combination
        for( let i = 1; i < truthTable.length; i++ ) {
    
            // Generate tr elem for this row
            let rowElem = tableElem.querySelector('tbody').insertRow(-1); // -1 inserts at end
    
            // Iterate over each premise, and replace its value in the code literal for this iterations combo.
            for( let j = 0; j < truthTable[i].length; j++ ) {
    
                // Add cell to our row for this premise with it's combination or conclusion
                rowElem.insertCell(-1).innerHTML = truthTable[i][j] ? 
                    '<strong class="h5"><code class="text-primary">T</code></strong>' : 
                    '<strong class="h5"><code>F</code></strong>';
            }
        }
    
        performanceTextElem.innerText = 'Truth table generated in ' + (performance.now() - performanceStart).toFixed(2) + ' ms.'
        currentTruthTable = truthTable;
    } catch (err) {
        errorElem.style.display = 'block';
        errorElem.innerHTML = `Malformed propositional logic;
            <pre class="mt-2">(${value}) => (${err.rowCode})<br>${err.message}</pre>Try using parentheses to specify order of precedence.`;
    }
}

// Changes JavaScript code literal into propositional syntax, e.g
// p || q -> p V q
function prettyPrint(string) {
    return string
        .replaceAll(regularExpressions.and, '&and;')
        .replaceAll(regularExpressions.or, '&or;')
        .replaceAll(regularExpressions.not, '&sim;')
        .replaceAll(regularExpressions.then, '&rarr;')
        .replaceAll(regularExpressions.xor, '&oplus;')
        .replaceAll(regularExpressions.equals, '&equiv;')
        .replaceAll('(', '&lpar;')
        .replaceAll(')', '&rpar;')
}

// Transforms a piece of propositional logic into javascript code literal
function parse(logic) {
    // Parse paranthesis
    logic = replaceParanthesis(logic, parse);
    
    // Then
    /**
     * This RegExp has two capture groups. 
     * #1 is capturing the expression on the left-hand side of the 'then' and #2 is the right-hand side.
     * 
     * p1 = group #1
     * p2 = group #2
     * 
     * In JavaScript we have no SIMPLE way of evaluating p -> q, however, we know that p -> q is logically equivalent to !p or q, 
     * thus, we use this RegExp and its capture groups alter the expression written to the form of !p or q.
     */
    logic = logic.replaceAll(regularExpressions.thenWrap, (whole, p1, p2) => {
        return '!(' + p1.trim() + ') || (' + p2.trim() + ')';
    } )

    return logic
        // Not
        .replaceAll(regularExpressions.not, '!')
        // And
        .replaceAll(regularExpressions.and, '&&')
        // Or
        .replaceAll(regularExpressions.or, '||')
        // Equals
        .replaceAll(regularExpressions.equals, '==')
        // Xor
        .replaceAll(regularExpressions.xor, '^')
        // Replace T/true and F/false values for JavaScript variants
        .replaceAll(regularExpressions.true, '1')
        .replaceAll(regularExpressions.false, '0')
}

/**
 * Steps through string and replaces everything inside outer-most paranthesis with the return value of callback(string)
 * Returns the final string
 */
function replaceParanthesis(string, callback) {
    // Controls our current depth of nested paranthesis pairs
    let control = 0;
    // The index of which the current outer-most opening bracket is
    let startIndex = -1;

    // Iterate over each character
    for(let i = 0; i < string.length; i++) {
        // If opening paranthesis, increment control
        if ( string[i] === '(' ) {
            control++;
            // If control becomes 1, our new outer-most opening bracket, store the start index for later
            if (control === 1) startIndex = i;
        }
        // If closing paranthesis, decrement control
        else if ( string[i] === ')' ) {
            control--;

            // If control is now 0, control must have been 1 previously, which means we just exited our outer-most paranthesis pair
            if ( control === 0 ) {
                /** 
                 * We must capture everything inside the paranthesis, pass it into callback,
                 * place the return of callback inbetween the paranthesis and then recalibrate i to be infront of our closing paranthesis as
                 * we have changed the length of the string we are iterating over
                 * 
                 * It is useful to set a breakpoint here and step through the code as it can be confusing to wrap your head around
                 */
                let replacementString = callback(string.substr(startIndex+1, i-startIndex-1));
                string = string.substr(0, startIndex+1) + replacementString + string.substr(i);
                i = startIndex + replacementString.length+3; // Recalibrate i
            }
        }
    }

    return string;
}

/**
 * Finds the cartesian product of multiple matrices
 * 
 * I originally thought this method would be quite slow so I did make a function that procedurally generates a row's combination
 * instead of stepping through from start to finish. Turns out the generation method takes approx. 2ms longer! So we're staying
 * with this function, which despite its loops is actually faster than I thought.
 */
function cartesianProduct( params )
{
    let cartesian = [];
    let matrices = params;

    for( let i = 0; i < matrices.length; i++ )
    {
        let innerFreq = 1;
        let outerFreq = 1;

        // Calculate inner frequency of this value
        matrices.slice( i+1, matrices.length ).forEach( matrix => {
            innerFreq *= matrix.length;
        } );

        // Calculate outer frequency
        matrices.slice( 0, i ).forEach( matrix => {
            outerFreq *= matrix.length;
        } );

        for( let h = 0; h < outerFreq; h++ )
        {
            for ( let j = 0; j < matrices[i].length; j++ )
            {
                for( let k = 0; k < innerFreq; k++ )
                {
                    let x = ( j * innerFreq ) + k + ( h * innerFreq * matrices[i].length )

                    if( !cartesian[x] ) cartesian[x] = [ matrices[i][j] ];
                    else cartesian[ x ].push( matrices[i][j] );
                }
            }
        }

    }

    return cartesian;
}
