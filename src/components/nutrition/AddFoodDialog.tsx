'use client'

import { useState, useEffect, useMemo } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Search, Plus, Loader2, ChefHat, Clock, Library, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import {
    searchFoods,
    createFood,
    getRecentFoodsForCurrentClient,
} from '@/data/nutrition/foods'
import { searchRecipes, createRecipe } from '@/data/nutrition/recipes'
import { addNutritionLogEntry } from '@/data/nutrition/log'
import {
    macrosForFood,
    macrosForRecipe,
    type Food,
    type Recipe,
    type MealType,
    type DayType,
} from '@/data/nutrition/tracking-types'
import { format } from 'date-fns'

type Tab = 'recent' | 'library' | 'recipes'

function parseDecimalInput(value: string | number, fallback = 0) {
    const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.')
    if (!normalized) return fallback
    const n = Number(normalized)
    return Number.isFinite(n) ? n : fallback
}

interface AddFoodDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    date: Date
    mealType: MealType
    mealLabel?: string
    mealOrder: number
    dayType: DayType | null
    onAdded: () => void
}

export function AddFoodDialog({
    open,
    onOpenChange,
    date,
    mealType,
    mealLabel,
    mealOrder,
    dayType,
    onAdded,
}: AddFoodDialogProps) {
    const [tab, setTab] = useState<Tab>('recent')
    const [query, setQuery] = useState('')
    const [recent, setRecent] = useState<Food[]>([])
    const [library, setLibrary] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<Recipe[]>([])
    const [loading, setLoading] = useState(false)

    // Selected item to confirm portion
    const [selectedFood, setSelectedFood] = useState<Food | null>(null)
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)

    // Create-new-food form
    const [creating, setCreating] = useState(false)

    // Create-new-recipe form
    const [creatingRecipe, setCreatingRecipe] = useState(false)

    useEffect(() => {
        if (!open) return
        // Reset
        setQuery('')
        setSelectedFood(null)
        setSelectedRecipe(null)
        setCreating(false)
        setCreatingRecipe(false)
        setTab('recent')
        ;(async () => {
            setLoading(true)
            const [r, lib, recs] = await Promise.all([
                getRecentFoodsForCurrentClient(20),
                searchFoods('', 50),
                searchRecipes('', 30),
            ])
            setRecent(r)
            setLibrary(lib)
            setRecipes(recs)
            setLoading(false)
        })()
    }, [open])

    // Re-search when query changes (debounced)
    useEffect(() => {
        if (!open) return
        const t = setTimeout(async () => {
            if (tab === 'library') {
                setLoading(true)
                const lib = await searchFoods(query, 50)
                setLibrary(lib)
                setLoading(false)
            } else if (tab === 'recipes') {
                setLoading(true)
                const recs = await searchRecipes(query, 30)
                setRecipes(recs)
                setLoading(false)
            }
        }, 220)
        return () => clearTimeout(t)
    }, [query, tab, open])

    const filteredRecent = useMemo(() => {
        if (!query) return recent
        const q = query.toLowerCase()
        return recent.filter(f =>
            f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q)
        )
    }, [recent, query])

    if (creating) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Crear alimento</DialogTitle>
                        <DialogDescription>
                            Añádelo a la biblioteca para ti y para los demás.
                        </DialogDescription>
                    </DialogHeader>
                    <CreateFoodForm
                        onCancel={() => setCreating(false)}
                        onCreated={async (food) => {
                            setLibrary(prev => [food, ...prev])
                            setCreating(false)
                            setSelectedFood(food)
                        }}
                    />
                </DialogContent>
            </Dialog>
        )
    }

    if (creatingRecipe) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Crear receta</DialogTitle>
                        <DialogDescription>Combina alimentos en una receta reutilizable.</DialogDescription>
                    </DialogHeader>
                    <CreateRecipeForm
                        onCancel={() => setCreatingRecipe(false)}
                        onCreated={async (r) => {
                            setRecipes(prev => [r, ...prev])
                            setCreatingRecipe(false)
                            setSelectedRecipe(r)
                        }}
                    />
                </DialogContent>
            </Dialog>
        )
    }

    if (selectedFood) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <FoodPortionForm
                        food={selectedFood}
                        date={date}
                        mealType={mealType}
                        mealLabel={mealLabel}
                        mealOrder={mealOrder}
                        dayType={dayType}
                        onBack={() => setSelectedFood(null)}
                        onAdded={() => {
                            setSelectedFood(null)
                            onAdded()
                            onOpenChange(false)
                        }}
                    />
                </DialogContent>
            </Dialog>
        )
    }

    if (selectedRecipe) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <RecipePortionForm
                        recipe={selectedRecipe}
                        date={date}
                        mealType={mealType}
                        mealLabel={mealLabel}
                        mealOrder={mealOrder}
                        dayType={dayType}
                        onBack={() => setSelectedRecipe(null)}
                        onAdded={() => {
                            setSelectedRecipe(null)
                            onAdded()
                            onOpenChange(false)
                        }}
                    />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="px-4 pt-4">
                    <DialogTitle>Añadir alimento</DialogTitle>
                    <DialogDescription>
                        {mealLabel ?? 'Comida'} · {format(date, 'dd/MM/yyyy')}
                    </DialogDescription>
                </DialogHeader>

                <div className="px-4 pt-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Buscar alimento o receta..."
                            className="pl-9"
                            autoFocus
                        />
                    </div>
                </div>

                <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid grid-cols-3 mx-4 mt-3">
                        <TabsTrigger value="recent"><Clock className="h-3.5 w-3.5 mr-1" /> Recientes</TabsTrigger>
                        <TabsTrigger value="library"><Library className="h-3.5 w-3.5 mr-1" /> Biblioteca</TabsTrigger>
                        <TabsTrigger value="recipes"><ChefHat className="h-3.5 w-3.5 mr-1" /> Recetas</TabsTrigger>
                    </TabsList>

                    <TabsContent value="recent" className="flex-1 overflow-hidden mt-2">
                        <FoodList
                            foods={filteredRecent}
                            loading={loading}
                            empty="Aún no has registrado alimentos. Empieza añadiendo desde la biblioteca."
                            onSelect={setSelectedFood}
                        />
                    </TabsContent>

                    <TabsContent value="library" className="flex-1 overflow-hidden mt-2">
                        <FoodList
                            foods={library}
                            loading={loading}
                            empty="Sin resultados. Crea un alimento nuevo."
                            onSelect={setSelectedFood}
                        />
                        <div className="px-4 py-3 border-t">
                            <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                                <Plus className="h-4 w-4 mr-2" /> Crear alimento
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="recipes" className="flex-1 overflow-hidden mt-2">
                        <RecipeList
                            recipes={recipes}
                            loading={loading}
                            empty="Aún no hay recetas. Crea una nueva."
                            onSelect={setSelectedRecipe}
                        />
                        <div className="px-4 py-3 border-t">
                            <Button variant="outline" className="w-full" onClick={() => setCreatingRecipe(true)}>
                                <Plus className="h-4 w-4 mr-2" /> Crear receta
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

// ----------------------------------------------------------------------------
// Listas
// ----------------------------------------------------------------------------
function FoodList({
    foods,
    loading,
    empty,
    onSelect,
}: {
    foods: Food[]
    loading: boolean
    empty: string
    onSelect: (f: Food) => void
}) {
    return (
        <ScrollArea className="h-[42vh] px-4">
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : foods.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{empty}</p>
            ) : (
                <ul className="divide-y">
                    {foods.map(f => (
                        <li key={f.id}>
                            <button
                                onClick={() => onSelect(f)}
                                className="w-full text-left py-3 hover:bg-muted/50 transition-colors px-1 rounded"
                            >
                                <div className="flex justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {f.name}
                                            {f.brand ? <span className="text-muted-foreground font-normal"> · {f.brand}</span> : null}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {Math.round(f.kcal)} kcal · P {f.protein_g}g · C {f.carbs_g}g · G {f.fat_g}g <span className="opacity-60">/ 100 g</span>
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </ScrollArea>
    )
}

function RecipeList({
    recipes,
    loading,
    empty,
    onSelect,
}: {
    recipes: Recipe[]
    loading: boolean
    empty: string
    onSelect: (r: Recipe) => void
}) {
    return (
        <ScrollArea className="h-[42vh] px-4">
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : recipes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{empty}</p>
            ) : (
                <ul className="divide-y">
                    {recipes.map(r => (
                        <li key={r.id}>
                            <button
                                onClick={() => onSelect(r)}
                                className="w-full text-left py-3 hover:bg-muted/50 transition-colors px-1 rounded"
                            >
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {Math.round(r.total_kcal / r.servings)} kcal/porción · {r.servings} porciones
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </ScrollArea>
    )
}

// ----------------------------------------------------------------------------
// Confirmar porción de alimento
// ----------------------------------------------------------------------------
function FoodPortionForm({
    food,
    date,
    mealType,
    mealLabel,
    mealOrder,
    dayType,
    onBack,
    onAdded,
}: {
    food: Food
    date: Date
    mealType: MealType
    mealLabel?: string
    mealOrder: number
    dayType: DayType | null
    onBack: () => void
    onAdded: () => void
}) {
    const [grams, setGrams] = useState<number>(food.serving_size_g || 100)
    const [saving, setSaving] = useState(false)
    const macros = macrosForFood(food, grams || 0)

    const handleAdd = async () => {
        if (!grams || grams <= 0) {
            toast.error('Introduce los gramos')
            return
        }
        setSaving(true)
        const res = await addNutritionLogEntry({
            log_date: format(date, 'yyyy-MM-dd'),
            meal_type: mealType,
            meal_label: mealLabel ?? null,
            meal_order: mealOrder,
            food_id: food.id,
            recipe_id: null,
            quantity_g: grams,
            servings: null,
            kcal: macros.kcal,
            protein_g: macros.protein_g,
            carbs_g: macros.carbs_g,
            fat_g: macros.fat_g,
            item_name: food.name + (food.brand ? ` · ${food.brand}` : ''),
            day_type: dayType ?? null,
        })
        setSaving(false)
        if (!res) {
            toast.error('No se pudo guardar')
            return
        }
        toast.success('Añadido')
        onAdded()
    }

    return (
        <>
            <DialogHeader>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <DialogTitle className="text-base">{food.name}</DialogTitle>
                </div>
                {food.brand && <DialogDescription>{food.brand}</DialogDescription>}
            </DialogHeader>

            <div className="space-y-3">
                <div className="space-y-1">
                    <Label htmlFor="grams">Gramos consumidos</Label>
                    <Input
                        id="grams"
                        type="text"
                        inputMode="decimal"
                        value={grams}
                        onChange={e => setGrams(parseDecimalInput(e.target.value))}
                        min={1}
                        step={1}
                    />
                    {food.serving_label && (
                        <p className="text-xs text-muted-foreground">
                            Porción sugerida: {food.serving_label} ({food.serving_size_g} g)
                        </p>
                    )}
                </div>

                <Card className="p-3">
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <Stat label="kcal" value={Math.round(macros.kcal).toString()} />
                        <Stat label="P" value={`${macros.protein_g}g`} />
                        <Stat label="C" value={`${macros.carbs_g}g`} />
                        <Stat label="G" value={`${macros.fat_g}g`} />
                    </div>
                </Card>

                <Button onClick={handleAdd} className="w-full" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Añadir a {mealLabel ?? 'la comida'}
                </Button>
            </div>
        </>
    )
}

function RecipePortionForm({
    recipe,
    date,
    mealType,
    mealLabel,
    mealOrder,
    dayType,
    onBack,
    onAdded,
}: {
    recipe: Recipe
    date: Date
    mealType: MealType
    mealLabel?: string
    mealOrder: number
    dayType: DayType | null
    onBack: () => void
    onAdded: () => void
}) {
    const [servings, setServings] = useState<number>(1)
    const [saving, setSaving] = useState(false)
    const macros = macrosForRecipe(recipe, servings || 0)

    const handleAdd = async () => {
        if (!servings || servings <= 0) {
            toast.error('Introduce las porciones')
            return
        }
        setSaving(true)
        const res = await addNutritionLogEntry({
            log_date: format(date, 'yyyy-MM-dd'),
            meal_type: mealType,
            meal_label: mealLabel ?? null,
            meal_order: mealOrder,
            food_id: null,
            recipe_id: recipe.id,
            quantity_g: null,
            servings,
            kcal: macros.kcal,
            protein_g: macros.protein_g,
            carbs_g: macros.carbs_g,
            fat_g: macros.fat_g,
            item_name: recipe.name,
            day_type: dayType ?? null,
        })
        setSaving(false)
        if (!res) {
            toast.error('No se pudo guardar')
            return
        }
        toast.success('Añadido')
        onAdded()
    }

    return (
        <>
            <DialogHeader>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <DialogTitle className="text-base">{recipe.name}</DialogTitle>
                </div>
            </DialogHeader>

            <div className="space-y-3">
                <div className="space-y-1">
                    <Label htmlFor="servings">Porciones</Label>
                    <Input
                        id="servings"
                        type="text"
                        inputMode="decimal"
                        step="0.5"
                        min={0.5}
                        value={servings}
                        onChange={e => setServings(parseDecimalInput(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">La receta tiene {recipe.servings} porciones en total.</p>
                </div>

                <Card className="p-3">
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <Stat label="kcal" value={Math.round(macros.kcal).toString()} />
                        <Stat label="P" value={`${macros.protein_g}g`} />
                        <Stat label="C" value={`${macros.carbs_g}g`} />
                        <Stat label="G" value={`${macros.fat_g}g`} />
                    </div>
                </Card>

                <Button onClick={handleAdd} className="w-full" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Añadir a {mealLabel ?? 'la comida'}
                </Button>
            </div>
        </>
    )
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-base font-bold">{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
    )
}

// ----------------------------------------------------------------------------
// Crear alimento nuevo
// ----------------------------------------------------------------------------
function CreateFoodForm({
    onCancel,
    onCreated,
}: {
    onCancel: () => void
    onCreated: (food: Food) => void
}) {
    const [name, setName] = useState('')
    const [brand, setBrand] = useState('')
    const [kcal, setKcal] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fat, setFat] = useState('')
    const [servingSize, setServingSize] = useState('100')
    const [servingLabel, setServingLabel] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Pon un nombre')
            return
        }
        const k = parseDecimalInput(kcal)
        const p = parseDecimalInput(protein)
        const c = parseDecimalInput(carbs)
        const f = parseDecimalInput(fat)
        if (k <= 0) {
            toast.error('Las kcal deben ser mayores que 0')
            return
        }
        setSaving(true)
        const food = await createFood({
            name: name.trim(),
            brand: brand.trim() || null,
            kcal: k,
            protein_g: p,
            carbs_g: c,
            fat_g: f,
            serving_size_g: parseDecimalInput(servingSize, 100),
            serving_label: servingLabel.trim() || null,
            is_public: true,
        })
        setSaving(false)
        if (!food) {
            toast.error('No se pudo crear')
            return
        }
        toast.success('Alimento creado')
        onCreated(food)
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Valores por 100 g (como en MyFitnessPal).</p>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="f-name">Nombre</Label>
                    <Input id="f-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Pechuga de pollo" />
                </div>
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="f-brand">Marca (opcional)</Label>
                    <Input id="f-brand" value={brand} onChange={e => setBrand(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-kcal">kcal / 100g</Label>
                    <Input id="f-kcal" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={kcal} onChange={e => setKcal(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-p">Proteína (g)</Label>
                    <Input id="f-p" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={protein} onChange={e => setProtein(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-c">Carbos (g)</Label>
                    <Input id="f-c" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={carbs} onChange={e => setCarbs(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-f">Grasa (g)</Label>
                    <Input id="f-f" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={fat} onChange={e => setFat(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-ss">Porción (g)</Label>
                    <Input id="f-ss" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={servingSize} onChange={e => setServingSize(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="f-sl">Etiqueta porción</Label>
                    <Input id="f-sl" value={servingLabel} onChange={e => setServingLabel(e.target.value)} placeholder="ej. 1 rebanada" />
                </div>
            </div>
            <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">Cancelar</Button>
                <Button onClick={handleSubmit} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Crear
                </Button>
            </div>
        </div>
    )
}

// ----------------------------------------------------------------------------
// Crear receta
// ----------------------------------------------------------------------------
function CreateRecipeForm({
    onCancel,
    onCreated,
}: {
    onCancel: () => void
    onCreated: (r: Recipe) => void
}) {
    const [name, setName] = useState('')
    const [servings, setServings] = useState('1')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Food[]>([])
    const [searching, setSearching] = useState(false)
    const [items, setItems] = useState<Array<{ food: Food; grams: number }>>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const t = setTimeout(async () => {
            setSearching(true)
            const r = await searchFoods(query, 20)
            setResults(r)
            setSearching(false)
        }, 220)
        return () => clearTimeout(t)
    }, [query])

    const totals = items.reduce(
        (acc, it) => {
            const m = macrosForFood(it.food, it.grams)
            acc.kcal += m.kcal
            acc.p += m.protein_g
            acc.c += m.carbs_g
            acc.f += m.fat_g
            return acc
        },
        { kcal: 0, p: 0, c: 0, f: 0 }
    )

    const addItem = (food: Food) => {
        setItems(prev => [...prev, { food, grams: food.serving_size_g || 100 }])
    }
    const updateGrams = (idx: number, g: number) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, grams: g } : it))
    }
    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx))
    }

    const handleSubmit = async () => {
        if (!name.trim()) return toast.error('Pon un nombre')
        if (items.length === 0) return toast.error('Añade al menos un ingrediente')
        const s = parseDecimalInput(servings, 1)
        setSaving(true)
        const r = await createRecipe({
            name: name.trim(),
            servings: s,
            ingredients: items,
            is_public: true,
        })
        setSaving(false)
        if (!r) {
            toast.error('No se pudo crear')
            return
        }
        toast.success('Receta creada')
        onCreated(r)
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="r-name">Nombre</Label>
                    <Input id="r-name" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="r-serv">Porciones</Label>
                    <Input id="r-serv" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={servings} onChange={e => setServings(e.target.value)} />
                </div>
            </div>

            <div className="space-y-1">
                <Label>Ingredientes</Label>
                {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aún no hay ingredientes.</p>
                ) : (
                    <ul className="space-y-2">
                        {items.map((it, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                                <span className="text-sm flex-1 truncate">{it.food.name}</span>
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    value={it.grams}
                                    onChange={e => updateGrams(idx, parseDecimalInput(e.target.value))}
                                    className="w-20 h-8"
                                />
                                <span className="text-xs text-muted-foreground">g</span>
                                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>×</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="space-y-1">
                <Label>Buscar para añadir</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={e => setQuery(e.target.value)} className="pl-9" placeholder="Buscar alimento" />
                </div>
                <ScrollArea className="h-32 mt-1 border rounded-md">
                    {searching ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {results.map(f => (
                                <li key={f.id}>
                                    <button
                                        onClick={() => addItem(f)}
                                        className="w-full text-left px-3 py-1.5 hover:bg-muted/50 text-sm flex justify-between"
                                    >
                                        <span className="truncate">{f.name}</span>
                                        <Plus className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </div>

            <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Totales receta completa</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="kcal" value={Math.round(totals.kcal).toString()} />
                    <Stat label="P" value={`${Math.round(totals.p * 10) / 10}g`} />
                    <Stat label="C" value={`${Math.round(totals.c * 10) / 10}g`} />
                    <Stat label="G" value={`${Math.round(totals.f * 10) / 10}g`} />
                </div>
            </Card>

            <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">Cancelar</Button>
                <Button onClick={handleSubmit} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Crear receta
                </Button>
            </div>
        </div>
    )
}
